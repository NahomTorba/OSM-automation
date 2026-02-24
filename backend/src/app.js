import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import exportRoutes from "./routes/export.routes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

app.use(express.static(path.join(__dirname, "../public")));

app.use("/exports", exportRoutes);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
