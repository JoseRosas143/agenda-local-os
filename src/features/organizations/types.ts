import type { OrganizationFieldErrors, OrganizationInput } from "./validation";

export type CreateOrganizationState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: OrganizationFieldErrors;
  values?: Partial<OrganizationInput>;
};

export const INITIAL_CREATE_ORGANIZATION_STATE: CreateOrganizationState = { status: "idle" };
