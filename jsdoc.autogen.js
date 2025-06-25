// jsdoc.autogen.js
import jsdocAutogen from "jsdoc-autogen";

const config = {
  output: "./docs/jsdoc-output.json",
  templates: {
    includeDate: false,
  },
  files: ["./backend/**/*.js"], // adjust as needed
};

jsdocAutogen(config);
