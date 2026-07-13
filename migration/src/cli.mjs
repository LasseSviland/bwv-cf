import { parseArgs } from "node:util";

import { downloadAndPrepare } from "./download.mjs";
import { validateSnapshot } from "./format.mjs";
import { uploadSnapshot } from "./upload.mjs";
import { uploadSnapshotWithWrangler } from "./upload-wrangler.mjs";
import { absoluteOutputPath } from "./util.mjs";

const USAGE = `
Historical MySQL to Cloudflare R2 migration

Phase 1 (read-only MySQL export plus local formatting):
  pnpm migration:download -- [--output PATH] [--resume | --force]

Phase 2 (merge remote catalogs and upload local files):
  pnpm migration:upload -- [--output PATH] --dry-run
  pnpm migration:upload -- [--output PATH] --confirm [--overwrite-inventory]
  pnpm migration:upload -- [--output PATH] --wrangler --confirm

Local validation:
  pnpm migration:validate -- [--output PATH]
`;

function argumentsFor(command, arguments_) {
  const common = { output: { type: "string" }, help: { type: "boolean", short: "h" } };
  const options =
    command === "download"
      ? { ...common, resume: { type: "boolean" }, force: { type: "boolean" } }
      : command === "upload"
        ? {
            ...common,
            confirm: { type: "boolean" },
            "dry-run": { type: "boolean" },
            "overwrite-inventory": { type: "boolean" },
            wrangler: { type: "boolean" },
            concurrency: { type: "string" },
          }
        : common;
  return parseArgs({ args: arguments_, options, strict: true, allowPositionals: false }).values;
}

async function main() {
  const [command, ...rawArguments] = process.argv.slice(2);
  const arguments_ = rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE.trim());
    return;
  }
  if (!["download", "upload", "validate"].includes(command)) {
    throw new Error(`Unknown migration command ${command}`);
  }
  const values = argumentsFor(command, arguments_);
  if (values.help) {
    console.log(USAGE.trim());
    return;
  }
  const root = absoluteOutputPath(values.output);

  if (command === "download") {
    const manifest = await downloadAndPrepare({
      root,
      resume: values.resume,
      force: values.force,
      onProgress: ({ rows, lastId, ceilingId }) =>
        console.log(
          `Downloaded ${rows.toLocaleString("en")} Better Wines inventory rows (source id ${lastId.toLocaleString("en")} / ${ceilingId.toLocaleString("en")})`,
        ),
    });
    console.log(
      `Prepared ${manifest.cloudflare.inventoryFiles.toLocaleString("en")} inventory files, ${manifest.cloudflare.wines.toLocaleString("en")} wines, and ${manifest.cloudflare.monopolies.toLocaleString("en")} monopolies in ${root}`,
    );
    return;
  }

  if (command === "validate") {
    const manifest = await validateSnapshot(root);
    console.log(
      `Validated ${manifest.cloudflare.objects.length.toLocaleString("en")} Cloudflare objects in ${root}`,
    );
    return;
  }

  const concurrency = values.concurrency === undefined ? 16 : Number(values.concurrency);
  const upload = values.wrangler ? uploadSnapshotWithWrangler : uploadSnapshot;
  const report = await upload({
    root,
    confirm: values.confirm,
    dryRun: values["dry-run"],
    overwriteInventory: values["overwrite-inventory"],
    concurrency,
  });
  console.log(
    `${report.status}: ${report.inventory.uploaded.toLocaleString("en")} inventory files uploaded, ${report.inventory.skippedExisting.toLocaleString("en")} existing files preserved; merged catalogs contain ${report.catalogs.wines.toLocaleString("en")} wines and ${report.catalogs.monopolies.toLocaleString("en")} monopolies`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
