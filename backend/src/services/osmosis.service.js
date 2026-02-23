import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";
import path from "path";

export function runExport() {
  return new Promise((resolve, reject) => {
    const now = new Date()

    const timestamp = now.toISOString()
        .replace(/T/, "_")      
        .replace(/:/g, "-")     
        .split(".")[0];   

    const shortId = uuidv4().slice(0,8)

    const jobId = `${timestamp}_${shortId}`;
    const outputFile = path.resolve(`../exports/${jobId}.osm.pbf`);

    const env = {
      ...process.env,
      JAVACMD_OPTIONS: "-Xmx8G -Djava.io.tmpdir=/tmp",
    };

    const args = [
      "--read-apidb",
      `host=${process.env.DB_HOST}`,
      `database=${process.env.DB_NAME}`,
      `user=${process.env.DB_USER}`,
      `password=${process.env.DB_PASS}`,
      "validateSchemaVersion=no",
      "--buffer",
      "--write-pbf",
      `file=${outputFile}`,
    ];

    const processExport = spawn("osmosis", args, { env });

    processExport.stdout.on("data", data =>
      console.log(data.toString())
    );

    processExport.stderr.on("data", data =>
      console.error(data.toString())
    );

    processExport.on("close", code => {
      if (code === 0) resolve({ jobId, outputFile });
      else reject(new Error("Export failed"));
    });
  });
}
