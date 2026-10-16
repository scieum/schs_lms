// 비밀번호 규칙 (PRD F1): 8자 이상, 초기 인증코드와 달라야 한다.

export const PASSWORD_MIN = 8;

export type PasswordProblem = "too_short" | "same_as_initial" | "mismatch";

export function checkNewPassword(
  next: string,
  confirm: string,
  initialCode: string,
): PasswordProblem | null {
  if (next.length < PASSWORD_MIN) return "too_short";
  if (next === initialCode) return "same_as_initial";
  if (next !== confirm) return "mismatch";
  return null;
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `비밀번호는 ${PASSWORD_MIN}자 이상이어야 해요`,
  same_as_initial: "처음 받은 인증코드와 다른 비밀번호를 써 주세요",
  mismatch: "두 비밀번호가 같지 않아요",
};
