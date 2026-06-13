import { getEntrySubject, getReadySubject } from "./emitters";

const main = () => {
  const entrySubject = getEntrySubject();
  entrySubject.subscribe(async (path) => {
    console.log("Running", path);
    await getReadySubject().next();
  });
};

main();
