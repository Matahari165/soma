import Foundation

public actor MealSubmissionCoordinator {
    private let api: any MealSubmissionAPI
    private let store: MealDraftStore
    private let pollTimeout: Duration

    public init(api: any MealSubmissionAPI, store: MealDraftStore, pollTimeout: Duration = .seconds(15)) { self.api = api; self.store = store; self.pollTimeout = pollTimeout }

    @discardableResult
    public func submit(_ draft: MealDraft) async throws -> MealDraft {
        var current = draft
        do {
            if current.stage == .polling {
                return try await refresh(current)
            }
            let isRetry = current.stage == .failed
            let wasAlreadyCreated = current.remoteMealId != nil
            try await persist(&current, stage: .creating)
            if current.remoteMealId == nil {
                current.remoteMealId = try await api.createMeal(from: current).meal.id
                try await store.save(current)
            }
            guard let mealID = current.remoteMealId else { throw MealSubmissionError.missingRemoteMeal }
            if wasAlreadyCreated {
                _ = try await api.updateMeal(
                    id: mealID,
                    body: MealUpdateRequest(
                        note: current.note,
                        entryState: current.entryState,
                        mouthWarmthIntensity: current.mouthWarmthIntensity,
                        stomachOverfullIntensity: current.stomachOverfullIntensity
                    )
                )
            }

            if current.entryState == .recorded {
                let pending = current.photos.filter {
                    !current.uploadedPhotoDraftIDs.contains($0.id) || current.remotePhotoIDsByDraftID?[$0.id] == nil
                }
                if !pending.isEmpty {
                    try await persist(&current, stage: .uploading)
                    // Each photo owns its retry key. If the app stops after one
                    // upload, resuming cannot mark the remaining photos as sent.
                    for photo in pending {
                        let response = try await api.uploadMealPhotos(mealID: mealID, photos: [photo], idempotencyKey: photo.uploadIdempotencyKey)
                        if let remoteID = response.photos.first?.id {
                            current.remotePhotoIDsByDraftID?[photo.id] = remoteID
                            if current.remotePhotoIDsByDraftID == nil { current.remotePhotoIDsByDraftID = [photo.id: remoteID] }
                        }
                        current.uploadedPhotoDraftIDs.insert(photo.id)
                        try await store.save(current)
                    }
                }
                let hasTextEvidence = !(current.note?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
                if !current.photos.isEmpty || current.hasRemotePhotoEvidence == true || hasTextEvidence {
                    try await persist(&current, stage: .requestingAnalysis)
                    if current.activeAnalysisRequestId == nil || isRetry {
                        current.activeAnalysisRequestId = isRetry
                            ? "\(current.analysisIdempotencyKey)-retry-\(UUID().uuidString.lowercased())"
                            : current.analysisIdempotencyKey
                        try await store.save(current)
                    }
                    let analysisRequestID = current.activeAnalysisRequestId ?? current.analysisIdempotencyKey
                    let response = try await withTimeout {
                        try await self.api.requestMealAnalysis(mealID: mealID, idempotencyKey: analysisRequestID, force: isRetry)
                    }
                    guard accept(response, into: &current, allowRequestRebind: true) else {
                        try await persist(&current, stage: .polling)
                        return current
                    }
                    if response.analysis?.status == "completed" { try await persist(&current, stage: .awaitingConfirmation); return current }
                    if response.analysis?.status == "failed" {
                        current.lastError = response.analysis?.error ?? "L’analyse du repas a échoué."
                        current.stage = .failed
                        try await store.save(current)
                        return current
                    }
                    try await persist(&current, stage: .polling)
                } else { try await persist(&current, stage: .local) }
            } else {
                _ = try await api.updateMeal(id: mealID, body: MealUpdateRequest(status: .confirmed, entryState: .skipped))
                try await persist(&current, stage: .confirmed)
            }
            return current
        } catch APIError.unauthorized {
            throw APIError.unauthorized
        } catch {
            current.stage = .failed
            current.lastError = String(describing: error)
            try? await store.save(current)
            return current
        }
    }

    @discardableResult
    public func refresh(_ draft: MealDraft) async throws -> MealDraft {
        guard let mealID = draft.remoteMealId else { return try await submit(draft) }
        var current = draft
        let analysisRequestID = current.activeAnalysisRequestId ?? current.analysisIdempotencyKey
        let response = try await withTimeout {
            try await self.api.mealAnalysisStatus(mealID: mealID, requestID: analysisRequestID)
        }
        // GET returns the meal's latest durable row. It may therefore be an
        // older response than the request this draft is following. Keep the
        // draft polling until the identity and source snapshot match.
        guard accept(response, into: &current, allowRequestRebind: false) else {
            try await persist(&current, stage: .polling)
            return current
        }
        switch response.analysis?.status {
        case "completed": try await persist(&current, stage: .awaitingConfirmation)
        case "failed": current.lastError = response.analysis?.error; try await persist(&current, stage: .failed)
        default: try await persist(&current, stage: .polling)
        }
        return current
    }

    @discardableResult
    public func confirm(_ draft: MealDraft) async throws -> MealDraft {
        guard let mealID = draft.remoteMealId else { throw MealSubmissionError.missingRemoteMeal }
        guard draft.stage == .awaitingConfirmation else { throw MealSubmissionError.analysisNotReady }
        var current = draft
        _ = try await api.updateMeal(
            id: mealID,
            body: MealUpdateRequest(
                status: .confirmed,
                analysisRequestId: current.activeAnalysisRequestId,
                analysisSourceRevision: current.analysisSourceRevision,
                analysisSourceFingerprint: current.analysisSourceFingerprint
            )
        )
        try await persist(&current, stage: .confirmed)
        return current
    }

    private func accept(_ response: MealAnalysisResponse, into draft: inout MealDraft, allowRequestRebind: Bool) -> Bool {
        guard let analysis = response.analysis else { return true }
        if let returnedID = analysis.analysisRequestId,
           let activeID = draft.activeAnalysisRequestId,
           returnedID != activeID {
            guard allowRequestRebind else { return false }
            draft.activeAnalysisRequestId = returnedID
        }
        if let expected = draft.analysisSourceFingerprint,
           let returned = analysis.sourceFingerprint,
           expected != returned {
            return false
        }
        draft.analysisSourceRevision = analysis.sourceRevision ?? draft.analysisSourceRevision
        draft.analysisSourceFingerprint = analysis.sourceFingerprint ?? draft.analysisSourceFingerprint
        return true
    }

    private func withTimeout<T: Sendable>(_ operation: @escaping @Sendable () async throws -> T) async throws -> T {
        let pollTimeout = self.pollTimeout
        return try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(for: pollTimeout)
                throw MealSubmissionError.timeout
            }
            defer { group.cancelAll() }
            guard let result = try await group.next() else { throw MealSubmissionError.timeout }
            return result
        }
    }

    private func persist(_ draft: inout MealDraft, stage: MealDraftStage) async throws {
        draft.stage = stage; draft.lastError = nil; try await store.save(draft)
    }
}

public enum MealSubmissionError: Error, Sendable { case missingRemoteMeal, analysisNotReady, timeout }
