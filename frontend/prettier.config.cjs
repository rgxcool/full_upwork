module.exports = {
  semi: false, // Remove semicolons
  singleQuote: true, // Use single quotes
  trailingComma: 'es5', // Use trailing commas where valid in ES5
  printWidth: 140, // Set max line length before wrapping
  tabWidth: 2, // Use 2 spaces for indentation
  bracketSpacing: true, // Add spaces inside object brackets
  arrowParens: 'always', // Always include parentheses in arrow functions
  vueIndentScriptAndStyle: true, // Indent inside <script> and <style> in Vue files
  overrides: [
    {
      files: '*.vue',
      options: {
        parser: 'vue',
      },
    },
  ],
}
