export type AuthField = "email" | "password" | "confirmPassword";
export type AuthActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
};
export const INITIAL_AUTH_STATE: AuthActionState = { status: "idle" };
