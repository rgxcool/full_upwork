// .prettierrc.js or prettier.config.js
module.exports = {
  semi: false, // No semicolons
  singleQuote: true, // Use single quotes
  trailingComma: 'es5', // Commas where valid in ES5 (e.g., object/array literals)
  printWidth: 100, // Line wrap at 100 chars
  tabWidth: 2, // Indent size
  useTabs: false, // Use spaces, not tabs
  bracketSpacing: true, // { foo: bar } instead of {foo:bar}
  arrowParens: 'always', // (x) => instead of x =>

  vueIndentScriptAndStyle: true, // Indent inside <script> and <style>

  htmlWhitespaceSensitivity: 'ignore', // Keeps Vue templates clean and unbroken
  embeddedLanguageFormatting: 'auto',

  overrides: [
    {
      files: '*.vue',
      options: {
        parser: 'vue',
      },
    },
  ],
}
