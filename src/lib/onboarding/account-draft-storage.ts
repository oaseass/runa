export const ACCOUNT_DRAFT_STORAGE_KEY = "luna.onboarding.accountDraft";

export type StoredAccountDraft = {
  draftId: string;
  username: string;
  phoneNumber: string;
  createdAt: string;
};

export function saveAccountDraft(payload: StoredAccountDraft) {
  sessionStorage.setItem(ACCOUNT_DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

export function getAccountDraft(): StoredAccountDraft | null {
  const raw = sessionStorage.getItem(ACCOUNT_DRAFT_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAccountDraft>;

    if (!parsed.draftId || !parsed.username || !parsed.phoneNumber || !parsed.createdAt) {
      return null;
    }

    return {
      draftId: parsed.draftId,
      username: parsed.username,
      phoneNumber: parsed.phoneNumber,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}
