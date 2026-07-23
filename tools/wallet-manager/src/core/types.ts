const privateServices = {
    walletPrivateService: Symbol.for('walletPrivateService'),
};

const publicServices = {
    walletPublicService: Symbol.for('walletPublicService'),
};

export const TYPES = {
    ...privateServices,
    ...publicServices,
}
