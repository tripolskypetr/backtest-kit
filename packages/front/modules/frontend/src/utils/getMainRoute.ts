export const getMainRoute = async () => {
    const url = new URL(location.href, location.origin);
    if (url.searchParams.has("pine")) {
        return "/pine_page";
    }
    return "/main";
};

export default getMainRoute;
