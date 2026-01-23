import { createActivator } from "di-kit";

export const { provide, inject, init, override } = createActivator("signal");
