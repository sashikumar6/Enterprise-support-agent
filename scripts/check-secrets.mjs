import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\b(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|CLIENT_SECRET|WEBHOOK_SECRET)\s*=\s*[^\s#][^\s]*/,
];

const findings = [];

for (const file of files) {
  let contents;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  contents.split("\n").forEach((line, index) => {
    if (secretPatterns.some((pattern) => pattern.test(line))) {
      findings.push(`${file}:${index + 1}`);
    }
  });
}

if (findings.length > 0) {
  console.error(`Potential secrets found:\n${findings.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed (${files.length} files checked).`);
}
