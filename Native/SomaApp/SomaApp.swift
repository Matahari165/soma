import SwiftUI
import Observation
import SomaCore
#if os(macOS)
import AppKit
import Quartz
#endif

@main
struct SomaApp: App {
    @State private var model = AppModel()
    #if os(macOS)
    @State private var visualBreaks = VisualBreakController()
    @AppStorage("visualBreak.showMenuBarIcon") private var showMenuBarIcon = true
    #endif

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .task { await model.restoreSession() }
                .onOpenURL { model.handleAuthenticationURL($0) }
                #if os(macOS)
                .environment(visualBreaks)
                #endif
        }
        #if os(macOS)
        .defaultSize(width: 1_440, height: 900)
        #endif
        #if os(macOS)
        MenuBarExtra(isInserted: $showMenuBarIcon) {
            VisualBreakMenu(controller: visualBreaks)
        } label: {
            Image(systemName: "eye")
                .font(.system(size: 15, weight: .medium))
                .frame(width: 18, height: 18)
                .accessibilityLabel("Pauses visuelles Soma")
        }
        .menuBarExtraStyle(.menu)
        #endif
    }
}

#if os(macOS)
private struct VisualBreakMenu: View {
    @Bindable var controller: VisualBreakController

    var body: some View {
        Toggle("Activer les pauses", isOn: $controller.enabled)
        Button("Faire une pause maintenant") { controller.test() }
        Divider()
        Text("Toutes les \(controller.intervalMinutes) min · pause de \(controller.durationSeconds) s")
    }
}

private final class VisualBreakPanel: NSPanel {
    override var canBecomeKey: Bool { true }
}

@MainActor @Observable
final class VisualBreakController {
    var enabled: Bool {
        didSet { defaults.set(enabled, forKey: "visualBreak.enabled"); resetCycle() }
    }
    var allDisplays: Bool {
        didSet {
            defaults.set(allDisplays, forKey: "visualBreak.allDisplays")
            rebuildPanels()
        }
    }
    var intervalMinutes: Int {
        didSet {
            intervalMinutes = min(120, max(1, intervalMinutes))
            defaults.set(intervalMinutes, forKey: "visualBreak.interval")
            resetCycle()
        }
    }
    var durationSeconds: Int {
        didSet {
            durationSeconds = min(120, max(5, (durationSeconds / 5) * 5))
            defaults.set(durationSeconds, forKey: "visualBreak.duration")
        }
    }
    private let defaults = UserDefaults.standard
    private var panels: [NSPanel] = []
    private var tickTimer: Timer?
    private var escapeMonitor: Any?
    private var observers: [NSObjectProtocol] = []
    private var elapsedActive: TimeInterval = 0
    private var lastTick = ProcessInfo.processInfo.systemUptime
    private var endDate: Date?
    private var remaining = 20
    private var displayedTotal = 20
    private var isSleeping = false

    init() {
        let defaults = UserDefaults.standard
        enabled = defaults.object(forKey: "visualBreak.enabled") as? Bool ?? true
        allDisplays = defaults.object(forKey: "visualBreak.allDisplays") as? Bool ?? true
        intervalMinutes = min(120, max(1, defaults.object(forKey: "visualBreak.interval") as? Int ?? 20))
        durationSeconds = min(120, max(5, defaults.object(forKey: "visualBreak.duration") as? Int ?? 20))
        let center = NSWorkspace.shared.notificationCenter
        observers.append(center.addObserver(forName: NSWorkspace.willSleepNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.isSleeping = true; self?.hide() }
        })
        observers.append(center.addObserver(forName: NSWorkspace.didWakeNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.isSleeping = false; self?.resetCycle() }
        })
        observers.append(NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.rebuildPanels() }
        })
        tickTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.tick() }
        }
    }

    func test() { show(totalSeconds: durationSeconds) }

    func show(totalSeconds: Int) {
        let wasVisible = !panels.isEmpty
        endDate = Date().addingTimeInterval(TimeInterval(totalSeconds))
        remaining = totalSeconds
        displayedTotal = totalSeconds
        elapsedActive = 0
        if panels.isEmpty { rebuildPanels() }
        else { updatePanels() }
        for panel in panels {
            if wasVisible { continue }
            panel.alphaValue = 0
            panel.orderFrontRegardless()
            NSAnimationContext.runAnimationGroup { context in
                context.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 1.2
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().alphaValue = 1
            }
        }
        if escapeMonitor == nil {
            escapeMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                if event.keyCode == 53 {
                    MainActor.assumeIsolated { self?.hide() }
                    return nil
                }
                return event
            }
        }
    }

    func hide() {
        endDate = nil
        elapsedActive = 0
        lastTick = ProcessInfo.processInfo.systemUptime
        if let escapeMonitor { NSEvent.removeMonitor(escapeMonitor); self.escapeMonitor = nil }
        let closing = panels
        panels = []
        for panel in closing {
            NSAnimationContext.runAnimationGroup { context in
                context.duration = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.6
                context.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
                panel.animator().alphaValue = 0
            } completionHandler: {
                MainActor.assumeIsolated {
                    panel.orderOut(nil)
                    panel.close()
                }
            }
        }
    }

    private func resetCycle() {
        hide()
        elapsedActive = 0
    }

    private func tick() {
        let now = ProcessInfo.processInfo.systemUptime
        let delta = max(0, now - lastTick)
        lastTick = now
        if let endDate {
            remaining = max(0, Int(ceil(endDate.timeIntervalSinceNow)))
            if remaining == 0 { hide() }
            else { updatePanels() }
            return
        }
        guard enabled, !isSleeping else { return }
        // A five-minute absence ends a continuous screen session; short pauses do not.
        let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .null)
        if idle >= 300 { elapsedActive = 0; return }
        elapsedActive += delta
        if elapsedActive >= TimeInterval(intervalMinutes * 60) { show(totalSeconds: durationSeconds) }
    }

    private func rebuildPanels() {
        guard endDate != nil else { return }
        let previous = panels
        panels = []
        previous.forEach { $0.orderOut(nil); $0.close() }
        for screen in (allDisplays ? NSScreen.screens : [NSScreen.main].compactMap { $0 }) {
            let panel = VisualBreakPanel(contentRect: screen.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
            panel.alphaValue = previous.isEmpty ? 0 : 1
            panel.isOpaque = false
            panel.backgroundColor = .clear
            panel.level = .screenSaver
            panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
            panel.hidesOnDeactivate = false
            panel.hasShadow = false
            panel.isMovable = false
            let effect = NSVisualEffectView(frame: NSRect(origin: .zero, size: screen.frame.size))
            effect.material = .fullScreenUI
            effect.blendingMode = .behindWindow
            effect.state = .active
            let hosting = NSHostingView(rootView: VisualBreakView(seconds: remaining, total: displayedTotal, skip: { [weak self] in self?.hide() }))
            hosting.translatesAutoresizingMaskIntoConstraints = false
            hosting.wantsLayer = true
            hosting.layer?.backgroundColor = NSColor.clear.cgColor
            effect.addSubview(hosting)
            NSLayoutConstraint.activate([
                hosting.leadingAnchor.constraint(equalTo: effect.leadingAnchor),
                hosting.trailingAnchor.constraint(equalTo: effect.trailingAnchor),
                hosting.topAnchor.constraint(equalTo: effect.topAnchor),
                hosting.bottomAnchor.constraint(equalTo: effect.bottomAnchor)
            ])
            panel.contentView = effect
            panel.orderFrontRegardless()
            panels.append(panel)
        }
    }

    private func updatePanels() {
        for panel in panels {
            guard let effect = panel.contentView as? NSVisualEffectView,
                  let hosting = effect.subviews.first as? NSHostingView<VisualBreakView> else { continue }
            hosting.rootView = VisualBreakView(seconds: remaining, total: displayedTotal, skip: { [weak self] in self?.hide() })
        }
    }
}

private struct VisualBreakView: View {
    let seconds: Int
    let total: Int
    let skip: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Label(Date.now.formatted(date: .omitted, time: .shortened), systemImage: "clock")
                .font(.system(size: 17, weight: .medium))
                .accessibilityLabel("Heure actuelle, \(Date.now.formatted(date: .omitted, time: .shortened))")
                .padding(.top, 64)
            Spacer()
            Text("C’est le moment de faire une pause.")
                .font(.system(size: 44, weight: .bold))
                .foregroundStyle(.white)
                .minimumScaleFactor(0.8)
                .lineLimit(2)
                .frame(maxWidth: 640)
            Text("Fixez un point éloigné pendant \(total) secondes.")
                .font(.system(size: 17))
                .padding(.top, 12)
            Rectangle().fill(.white.opacity(0.35)).frame(width: 120, height: 1)
                .padding(.top, 24).accessibilityHidden(true)
            Text(String(format: "%02d:%02d", seconds / 60, seconds % 60))
                .font(.system(size: 76, weight: .bold, design: .monospaced))
                .foregroundStyle(Color(red: 0.68, green: 0.94, blue: 0.92))
                .padding(.top, 20)
                .accessibilityLabel("Pause visuelle, \(seconds) secondes restantes")
                .accessibilityAddTraits(.updatesFrequently)
            Spacer()
            Button("Passer la pause", action: skip)
                .buttonStyle(.plain)
                .font(.system(size: 15, weight: .medium))
                .underline()
                .frame(minWidth: 120, minHeight: 44)
            Text("Échap pour passer")
                .font(.system(size: 13))
                .padding(.top, 6)
                .padding(.bottom, 44)
        }
        .foregroundStyle(.white.opacity(0.85))
        .shadow(color: .black.opacity(0.5), radius: 8, x: 0, y: 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 32)
        .background(Color.black.opacity(0.18))
    }
}
#endif
