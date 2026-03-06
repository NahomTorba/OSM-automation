import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";


async function updateSymlinkAndRestart(mbtilesPath, onData) {
  const symlinkPath = process.env.TILE_SYMLINK_PATH;
  const restartEnabled = process.env.RESTART_TILE_SERVICES === "true";
  const services = process.env.TILE_SERVICES
    ? process.env.TILE_SERVICES.split(",").map(s => s.trim())
    : [];

  /*Update the symlink to point to the new .mbtiles cuz my tile.service always points to the same file
  you probly won't need it depending on how your tile.service is set up*/
  if (symlinkPath) {
    try {
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }

      fs.symlinkSync(mbtilesPath, symlinkPath);
      onData(`Symlink updated  ${symlinkPath}`, "stdout");
    } catch (err) {
      throw new Error(`Symlink update failed: ${err.message}`);
    }
  }

  // Restart tile.service and possibly multiple services 
  if (restartEnabled && services.length > 0) {
    for (const service of services) {
      await new Promise((resolve, reject) => {
        const proc = spawn("sudo", ["systemctl", "restart", service]);

        proc.on("close", (code) => {
          if (code !== 0) {
            return reject(
              new Error(`Failed to restart ${service} (exit code ${code})`)
            );
          }

          onData(`${service} restarted successfully.`, "stdout");
          resolve();
        });

        proc.on("error", reject);
      });
    }
  }
}

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

    const mbtilesDir = path.resolve(
      process.cwd(),
      process.env.MBTILES_DIR && "../exports"
    );

    const osmOutput = path.join(exportsDir, `${jobId}.osm.pbf`);
    const mbtilesOutput = path.join(mbtilesDir, `${jobId}.mbtiles`);

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

      const projectRoot = process.cwd();

      const configPath = path.join(projectRoot, "resources/config-openmaptiles.json");
      const processPath = path.join(projectRoot, "resources/process-openmaptiles.lua");


      const tilemakerArgs = [
        "--input", osmOutput,
        "--output", mbtilesOutput,
        "--config", configPath,
        "--process", processPath
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

        updateSymlinkAndRestart(mbtilesOutput, onData)
        .then(() => {
          resolve({
            jobId,
            osmFile: osmOutput,
            mbtilesFile: mbtilesOutput,
          });
        })
        .catch(reject);
      });

      tilemakerProcess.on("error", reject);
    });

    osmosisProcess.on("error", reject);
  });

  promise.childProcess = activeChild;
  return promise;
}
