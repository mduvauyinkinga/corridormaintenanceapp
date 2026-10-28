/**
 * babel.config.js
 * ------------------------------------------------------------------
 * Standard Expo/React Native Babel setup.
 *
 * babel-preset-expo is a dependency of the `expo` package, but npm can
 * nest it under node_modules/expo/node_modules (see package-lock.json),
 * where Babel cannot resolve it from this config file. Declaring it as an
 * explicit devDependency pins the same version at the project root so the
 * preset always resolves.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
