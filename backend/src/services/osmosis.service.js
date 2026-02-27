import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export function runExport(params, onData) {
  let activeChild = null;

  const promise = new Promise((resolve, reject) => {
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/T/, "_")
      .replace(/:/g, "-")
      .split(".")[0];

    const shortId = uuidv4().slice(0, 8);
    const jobId = `${timestamp}_${shortId}`;

    const exportsDir = path.resolve(process.cwd(), "../exports");
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const osmOutput = path.join(exportsDir, `${jobId}.osm.pbf`);
    const mbtilesOutput = path.join(exportsDir, `${jobId}.mbtiles`);

    const env = {
      ...process.env,
      JAVACMD_OPTIONS: "-Xmx8G -Djava.io.tmpdir=/tmp",
    };

    const host = params.host || process.env.DB_HOST;
    const database = params.database || process.env.DB_NAME;
    const user = params.user || process.env.DB_USER;
    const password = params.password || process.env.DB_PASS;

    // osmosis export .osm.pbf file
    const osmosisArgs = [
      "--read-apidb",
      `host=${host}`,
      `database=${database}`,
      `user=${user}`,
      `password=${password}`,
      "validateSchemaVersion=no",
      "--buffer",
      "--write-pbf",
      `file=${osmOutput}`,
    ];

    onData("Starting Osmosis export...", "stdout");

    const osmosisProcess = spawn("osmosis", osmosisArgs, { env });
    activeChild = osmosisProcess;

    osmosisProcess.stdout.on("data", (data) => {
      onData(data.toString(), "stdout");
    });

    osmosisProcess.stderr.on("data", (data) => {
      onData(data.toString(), "stderr");
    });

    osmosisProcess.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Osmosis failed with code ${code}`));
      }

      onData("Osmosis completed successfully.", "stdout");

      // Run tilemaker to conver .osm.pbf file to .mbtiles 

      onData("Starting Tilemaker conversion...", "stdout");
      

      const tilemakerArgs = [
        "--input", osmOutput,
        "--output", mbtilesOutput,
        "--config", "resources/config-openmaptiles.json",
        "--process", "resources/process-openmaptiles.lua"
      ];

      const tilemakerProcess = spawn("tilemaker", tilemakerArgs);
      activeChild = tilemakerProcess;

      tilemakerProcess.stdout.on("data", (data) => {
        onData(data.toString(), "stdout");
      });

      tilemakerProcess.stderr.on("data", (data) => {
        onData(data.toString(), "stderr");
      });

      tilemakerProcess.on("close", (tileCode) => {
        if (tileCode !== 0) {
          return reject(new Error(`Tilemaker failed with code ${tileCode}`));
        }

        onData("Tilemaker completed successfully.", "stdout");

        resolve({
          jobId,
          osmFile: osmOutput,
          mbtilesFile: mbtilesOutput,
        });
      });

      tilemakerProcess.on("error", reject);
    });

    osmosisProcess.on("error", reject);
  });

  promise.childProcess = activeChild;
  return promise;
}
