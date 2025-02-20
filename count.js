import fs from "fs";
import path from "path";
import * as shapefile from "shapefile";
import { fileURLToPath } from "url";

async function makeFeatures(shpPath) {
  try {
    const features = [];
    const source = await shapefile.open(shpPath);

    while (true) {
      const result = await source.read();
      if (result.done) {
        break;
      }

      features.push({
        // type: value.type,
        type: "Feature",
        geometry: result.value.geometry,
      });
    }

    return features;
  } catch (error) {
    console.error("좌표 변환 중 오류 발생:", error);
  }
}

async function readShpFile(unzippedDir, region) {
  const regionDir = path.join(unzippedDir, region);
  try {
    const files = fs.readdirSync(regionDir);
    const shpFile = files?.find((file) => file.endsWith(".shp"));
    if (!files || !shpFile) {
      return;
    }

    const shpPath = path.join(regionDir, shpFile);
    const features = await makeFeatures(shpPath);

    console.log(
      "shp 파일을 읽어왔습니다.",
      region,
      features.length.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    );
  } catch (error) {
    console.error("shp 파일 읽기 실패:", error);
  }
}

export async function countAndInsertFeaturesByRegion() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const unzippedDir = path.join(__dirname, "data", "unzipped");

  const regions = fs.readdirSync(unzippedDir);

  for (const region of regions) {
    await readShpFile(unzippedDir, region);
  }
}

// ! process 실행
await countAndInsertFeaturesByRegion();
