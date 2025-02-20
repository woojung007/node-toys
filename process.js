import AdmZip from "adm-zip";
import fs from "fs";
import iconv from "iconv-lite";
import path from "path";
import proj4 from "proj4";
import * as shapefile from "shapefile";
import { fileURLToPath } from "url";

// EPSG:5186 정의
proj4.defs(
  "EPSG:5186",
  "+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs"
);

function unzip(zipPath) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // ZIP 파일 열기
    const zip = new AdmZip(zipPath);

    // ZIP 파일명 기반으로 폴더 생성
    let zipFileName = path.basename(zipPath, path.extname(zipPath)); // 확장자 제거
    zipFileName = zipFileName.replace(/^LSMD_CONT_LDREG_/, "");
    const unzippedPath = path.join(__dirname, "data", "unzipped", zipFileName);

    console.log("📂 추출 시작 : ", zipFileName, "=>", zipPath);

    if (!fs.existsSync(unzippedPath)) {
      fs.mkdirSync(unzippedPath, { recursive: true });
    }

    // 압축 해제
    zip.extractAllTo(unzippedPath, true);
    console.log("zip 압축을 해제했습니다.");

    return { unzippedPath, zipFileName };
  } catch (error) {
    console.error("압축 해제 실패:", error);
  }
}

// CP949 / EUC-KR 인코딩 변환
function encodingProperties(properties) {
  const convertedProperties = {};
  for (const key in properties) {
    if (typeof properties[key] === "string") {
      convertedProperties[key] = iconv
        .decode(Buffer.from(properties[key], "binary"), "euc-kr")
        .trim();
    } else {
      convertedProperties[key] = properties[key];
    }
  }
  return convertedProperties;
}

// 변환할 좌표계 설정
const fromProjection = "EPSG:5186";
const toProjection = "EPSG:4326";

// 좌표 변환 함수 (재귀적으로 처리)
function transformCoordinates(coords) {
  if (typeof coords[0] === "number") {
    // 단일 좌표 변환
    return proj4(fromProjection, toProjection, coords);
  }
  // 다중 좌표 변환 (폴리곤, 멀티폴리곤 등)
  return coords.map(transformCoordinates);
}

// 좌표 변환
async function convertShpProjection(shpPath) {
  try {
    const features = [];
    const source = await shapefile.open(shpPath);

    while (true) {
      const result = await source.read();
      if (result.done) {
        console.log("모든 피처를 읽었습니다.");
        break;
      }

      const { value } = result;
      if (value.geometry && value.geometry.coordinates) {
        value.geometry.coordinates = transformCoordinates(
          value.geometry.coordinates
        );
      }
      const convertedProperties = encodingProperties(value.properties);

      features.push({
        // type: value.type,
        type: "Feature",
        geometry: value.geometry,
        properties: convertedProperties,
      });
    }

    console.log("좌표 변환이 완료되었습니다.");
    return features;
  } catch (error) {
    console.error("좌표 변환 중 오류 발생:", error);
  }
}

async function readShpFiles(unzippedPath) {
  try {
    const files = fs.readdirSync(unzippedPath);
    const shpFile = files?.find((file) => file.endsWith(".shp"));
    const prjFile = files?.find((file) => file.endsWith(".prj"));

    if (!files || !shpFile || !prjFile) {
      console.log("shp / prj 파일이 없습니다.");
      return;
    }

    const shpPath = path.join(unzippedPath, shpFile);
    // const prjPath = path.join(unzippedPath, prjFile);

    const features = await convertShpProjection(shpPath);
    console.log("shp 파일을 읽어왔습니다.", features.length);

    // ! prj 파일 읽어오기
    // const projection = fs.readFileSync(prjPath, 'utf8').trim();
    // console.log('prj 파일을 읽어왔습니다.');

    return {
      type: "FeatureCollection",
      features: features,
      // projection: projection,
    };
  } catch (error) {
    console.error("shp 파일 읽기 실패:", error);
  }
}

// JSON 데이터 저장
function saveIntoJson(zipFileName, featureCollection) {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const jsonDirPath = path.join(__dirname, "data", "json");
    if (!fs.existsSync(jsonDirPath)) {
      fs.mkdirSync(jsonDirPath, { recursive: true });
    }

    const jsonOutputPath = path.join(
      __dirname,
      "data",
      "json",
      `${zipFileName}-4326.json`
    );
    fs.writeFileSync(
      jsonOutputPath,
      JSON.stringify(featureCollection, null, 2)
    );
    console.log("JSON 파일이 저장되었습니다.");
    return true;
  } catch (error) {
    console.error("JSON 파일 저장 실패:", error);
    return false;
  }
}

/**
 * ZIP 파일을 해제하고 SHP 파일에서 Geometry(좌표)만 추출 후 JSON으로 저장
 * @param zipPath - ZIP 파일 경로
 */
async function unzipShpAndSaveToJson(zipPath) {
  const result = unzip(zipPath);
  if (result) {
    const featureCollection = await readShpFiles(result.unzippedPath);

    // ! JSON 파일 생성
    if (featureCollection) {
      const success = saveIntoJson(result.zipFileName, featureCollection);
      if (success) {
      }
    }
  }
}

export async function processAllZipFiles() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const zipDir = path.join(__dirname, "data", "zip");

  const zipFiles = fs
    .readdirSync(zipDir)
    .filter((file) => file.endsWith(".zip"));

  // ! 모든 zip 파일 처리
  for (const zipFile of zipFiles) {
    const zipPath = path.join(zipDir, zipFile);
    await unzipShpAndSaveToJson(zipPath);
  }

  // ! 특정 zip 파일 처리
  // const zipPath = path.join(zipDir, zipFiles[1]);
  // await unzipShpAndSaveToJson(zipPath);
  console.log("🎉 모든 ZIP 파일 처리 완료!");
}
