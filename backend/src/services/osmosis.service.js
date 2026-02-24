import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";

export function runExport(params, onData) {
  let childProcess;

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

    const outputFile = path.join(exportsDir, `${jobId}.osm.pbf`);

    const env = {
      ...process.env,
      JAVACMD_OPTIONS: "-Xmx8G -Djava.io.tmpdir=/tmp",
    };

    const host = params.host || process.env.DB_HOST;
    const database = params.database || process.env.DB_NAME;
    const user = params.user || process.env.DB_USER;
    const password = params.password || process.env.DB_PASS;

    const args = [
      "--read-apidb",
      `host=${host}`,
      `database=${database}`,
      `user=${user}`,
      `password=${password}`,
      "validateSchemaVersion=no",
      "--buffer",
      "--write-pbf",
      `file=${outputFile}`,
    ];

    childProcess = spawn("osmosis", args, { env });

    childProcess.stdout.on("data", (data) => {
      onData(data.toString(), "stdout");
    });

    childProcess.stderr.on("data", (data) => {
      onData(data.toString(), "stderr");
    });

    childProcess.on("close", (code) => {
      if (code === 0) resolve({ jobId, outputFile });
      else reject(new Error(`Export failed with code ${code}`));
    });

    childProcess.on("error", (err) => {
      reject(err);
    });
  });

  promise.childProcess = childProcess;
  return promise;
}
