import { PrismaClient } from "@prisma/client";
import { createServer } from "./app.js";
import { spawn } from 'node:child_process';




const PORT = process.env.PORT || 4005;

const prisma = new PrismaClient();
const worker = spawn(process.execPath, ['./modules/workers/media.worker.js'], {
  stdio: 'inherit',
  env: process.env,
});

const { server } = createServer({ enableCron: true });

server.listen(PORT, async () => {
  try {
    console.log(`Server running on http://localhost:${PORT}`);
    await prisma.$connect();
    console.log("Database connected to prisma");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});
