"use strict";exports.__esModule=true;exports.default=void 0;var _webpackSources=require("webpack-sources");var _constants=require("../../../next-server/lib/constants");// This plugin creates a pages-manifest.json from page entrypoints.
// This is used for mapping paths like `/` to `.next/server/static/<buildid>/pages/index.js` when doing SSR
// It's also used by next export to provide defaultPathMap
class PagesManifestPlugin{constructor(serverless){this.serverless=void 0;this.serverless=serverless;}apply(compiler){compiler.hooks.emit.tap('NextJsPagesManifest',compilation=>{const{chunks}=compilation;const pages={};for(const chunk of chunks){const result=(this.serverless?_constants.SERVERLESS_ROUTE_NAME_REGEX:_constants.ROUTE_NAME_REGEX).exec(chunk.name);if(!result){continue;}const pagePath=result[1];if(!pagePath){continue;}// Write filename, replace any backslashes in path (on windows) with forwardslashes for cross-platform consistency.
pages[`/${pagePath.replace(/\\/g,'/')}`]=chunk.name.replace(/\\/g,'/');}if(typeof pages['/index']!=='undefined'){pages['/']=pages['/index'];}compilation.assets[_constants.PAGES_MANIFEST]=new _webpackSources.RawSource(JSON.stringify(pages));});}}exports.default=PagesManifestPlugin;