import Foundation

public actor MealSubmissionCoordinator {
    private let api: APIClient
    private let store: MealDraftStore

    public init(api: APIClient, store: MealDraftStore) { self.api = api; self.store = store }

    @discardableResult
    public func submit(_ draft: MealDraft) async throws -> MealDraft {
        var current = draft
        do {
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
                let pending = current.photos.filter { !current.uploadedPhotoDraftIDs.contains($0.id) }
                if !pending.isEmpty {
                    try await persist(&current, stage: .uploading)
                    _ = try await api.uploadMealPhotos(mealID: mealID, photos: pending, idempotencyKey: current.uploadIdempotencyKey)
                    current.uploadedPhotoDraftIDs.formUnion(pending.map(\.id)); try await store.save(current)
                }
                let hasTextEvidence = !(current.note?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
                if !current.photos.isEmpty || hasTextEvidence {
                    try await persist(&current, stage: .requestingAnalysis)
                    let response = try await api.requestMealAnalysis(mealID: mealID, idempotencyKey: current.analysisIdempotencyKey)
                    if response.analysis?.status == "completed" { try await persist(&current, stage: .completed); return current }
                    try await persist(&current, stage: .polling)
                } else { try await persist(&current, stage: .completed) }
            } else { try await persist(&current, stage: .completed) }
            return current
        } catch {
            current.stage = .failed; current.lastError = String(describing: error); try? await store.save(current); throw error
        }
    }

    @discardableResult
    public func refresh(_ draft: MealDraft) async throws -> MealDraft {
        guard let mealID = draft.remoteMealId else { return try await submit(draft) }
        var current = draft
        let response = try await api.mealAnalysisStatus(mealID: mealID, requestID: current.analysisIdempotencyKey)
        switch response.analysis?.status {
        case "completed": try await persist(&current, stage: .completed)
        case "failed": current.lastError = response.analysis?.error; try await persist(&current, stage: .failed)
        default: try await persist(&current, stage: .polling)
        }
        return current
    }

    private func persist(_ draft: inout MealDraft, stage: MealDraftStage) async throws {
        draft.stage = stage; draft.lastError = nil; try await store.save(draft)
    }
}

public enum MealSubmissionError: Error, Sendable { case missingRemoteMeal }
