const baseServices = {
  alertService: Symbol("alertService"),
  errorService: Symbol("errorService"),
  layoutService: Symbol("layoutService"),
  loggerService: Symbol("loggerService"),
  routerService: Symbol("routerService"),
};


export const TYPES = {
    ...baseServices,
}

export default TYPES;
