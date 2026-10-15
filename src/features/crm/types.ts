import type { ContactValues, FieldErrors, ServiceValues } from "./validation";

export type ContactFormState = {
  message?: string;
  fieldErrors?: FieldErrors<ContactValues>;
  values?: ContactValues;
};

export type ServiceFormState = {
  message?: string;
  fieldErrors?: FieldErrors<ServiceValues>;
  values?: ServiceValues;
};
