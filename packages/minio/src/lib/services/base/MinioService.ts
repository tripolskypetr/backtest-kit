import { memoize } from "functools-kit";
import { getMinio } from "../../../config/minio";

export class MinioService {
  public getClient = memoize(
    (bucketName) => bucketName,
    async (bucketName: string) => {
      const minioClient = getMinio();
      if (await minioClient.bucketExists(bucketName)) {
        return minioClient;
      }
      await minioClient.makeBucket(bucketName);
      return minioClient;
    }
  );
}

export default MinioService;
