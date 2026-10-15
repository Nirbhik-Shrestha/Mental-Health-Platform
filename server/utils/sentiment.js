import { spawn } from "child_process";
import path from "path";

const analyzeSentiment = (text) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join("utils", "analyze_sentiment.py");
    const process = spawn("python", [scriptPath, text]);

    let result = "";

    process.stdout.on("data", (data) => {
      result += data.toString();
    });

    process.stderr.on("data", (data) => {
      console.error("Sentiment Error:", data.toString());
    });

    process.on("close", () => {
      resolve(result.trim());
    });

    process.on("error", (err) => {
      reject(err);
    });
  });
};

export default analyzeSentiment;
