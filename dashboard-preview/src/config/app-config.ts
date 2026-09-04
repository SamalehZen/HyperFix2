import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "HyperFix",
  version: packageJson.version,
  copyright: `© ${currentYear}, HyperFix.`,
  meta: {
    title: "HyperFix, la fixation — notre raison d'être.",
    description: "HyperFix, la fixation — notre raison d'être.",
  },
};
