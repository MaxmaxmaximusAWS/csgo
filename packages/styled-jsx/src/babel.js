// Packages
import jsx from 'babel-plugin-syntax-jsx'

import { visitor as externalStylesVisitor } from './babel-external'

import {
  isGlobalEl,
  isStyledJsx,
  findStyles,
  makeStyledJsxTag,
  getJSXStyleInfo,
  computeClassNames,
  addClassName,
  getScope,
  processCss,
  createReactComponentImportDeclaration,
  setStateOptions
} from './_utils'

import { STYLE_COMPONENT } from './_constants'
import * as t from "@babel/types";


function isJsxStyleTag(name) {
  if (!name) return false
  return name === 'style' || name === STYLE_COMPONENT
}


function isComponentTag(path, name) {
  if (!name) {
    return false
  }

  if (name.charAt(0) === name.charAt(0).toUpperCase()) {
    return true
  }

  const tag = path.get('name')
  return !Object.values(path.scope.bindings).some(binding =>
    binding.referencePaths.some(ref => ref === tag)
  )
}


function needAddClassNameToComponent(path) {
  let attributes = path.get('attributes')

  for (let attr of attributes) {
    if (t.isJSXAttribute(attr) && attr.node.name.name === 'className') {
      return true
    }
  }

  return false
}


export default function ({types: t}) {
  const jsxVisitors = {

    JSXOpeningElement(path, state) {
      const el = path.node
      const {name} = el.name || {}

      if (!state.hasJSXStyle) {
        return
      }

      if (state.ignoreClosing === null) {
        state.ignoreClosing = 0
      }

      if (state.className && !isJsxStyleTag(name)) {

        if (isComponentTag(path, name)) {
          if (needAddClassNameToComponent(path)) {
            addClassName(path, state.className)
          }
        } else {
          addClassName(path, state.className)
        }
      }

      state.ignoreClosing++
    },

    JSXElement: {
      enter(path, state) {
        if (state.hasJSXStyle !== null) {
          return
        }

        const styles = findStyles(path)

        if (styles.length === 0) {
          return
        }

        state.file.HAS_STYLE_JSX_TAG = true
        state.styles = []
        state.externalStyles = []

        const scope = getScope(path)

        for (const style of styles) {
          // Compute children excluding whitespace
          const children = style.get('children').filter(
            c =>
              t.isJSXExpressionContainer(c.node) ||
              // Ignore whitespace around the expression container
              (t.isJSXText(c.node) && c.node.value.trim() !== '')
          )

          if (children.length !== 1) {
            throw path.buildCodeFrameError(
              `Expected one child under ` +
              `JSX Style tag, but got ${ children.length } ` +
              `(eg: <style jsx>{\`hi\`}</style>)`
            )
          }

          const child = children[0]

          if (!t.isJSXExpressionContainer(child)) {
            throw path.buildCodeFrameError(
              `Expected a child of ` +
              `type JSXExpressionContainer under JSX Style tag ` +
              `(eg: <style jsx>{\`hi\`}</style>), got ${ child.type }`
            )
          }

          const expression = child.get('expression')

          if (t.isIdentifier(expression)) {
            const idName = expression.node.name
            if (expression.scope.hasBinding(idName)) {
              const externalStylesIdentifier = t.identifier(idName)
              const isGlobal = isGlobalEl(style.get('openingElement').node)
              state.externalStyles.push([
                t.memberExpression(
                  externalStylesIdentifier,
                  t.identifier('__hash')
                ),
                externalStylesIdentifier,
                isGlobal
              ])
              continue
            }

            throw path.buildCodeFrameError(
              `The Identifier ` +
              `\`${ expression.getSource() }\` is either \`undefined\` or ` +
              `it is not an external StyleSheet reference i.e. ` +
              `it doesn't come from an \`import\` or \`require\` statement`
            )
          }

          if (
            !t.isTemplateLiteral(expression) &&
            !t.isStringLiteral(expression)
          ) {
            throw path.buildCodeFrameError(
              `Expected a template ` +
              `literal or String literal as the child of the ` +
              `JSX Style tag (eg: <style jsx>{\`some css\`}</style>),` +
              ` but got ${ expression.type }`
            )
          }

          state.styles.push(getJSXStyleInfo(expression, scope))
        }

        let externalJsxId
        if (state.externalStyles.length > 0) {
          const expressions = state.externalStyles
          // Remove globals
          .filter(s => !s[2])
          .map(s => s[0])

          const expressionsLength = expressions.length

          if (expressionsLength === 0) {
            externalJsxId = null
          } else {
            // Construct a template literal of this form:
            // `jsx-${styles.__scopedHash} jsx-${otherStyles.__scopedHash}`
            externalJsxId = t.templateLiteral(
              [
                t.templateElement({raw: 'jsx-', cooked: 'jsx-'}),
                ...[...new Array(expressionsLength - 1).fill(null)].map(() =>
                  t.templateElement({raw: ' jsx-', cooked: ' jsx-'})
                ),
                t.templateElement({raw: '', cooked: ''}, true)
              ],
              expressions
            )
          }
        }

        if (state.styles.length > 0 || externalJsxId) {
          const {staticClassName, className} = computeClassNames(
            state.styles,
            externalJsxId
          )
          state.className = className
          state.staticClassName = staticClassName
        }

        state.hasJSXStyle = true
        state.file.hasJSXStyle = true

        // Next visit will be: JSXOpeningElement
      },
      exit(path, state) {
        const isGlobal = isGlobalEl(path.node.openingElement)

        if (state.hasJSXStyle && !--state.ignoreClosing && !isGlobal) {
          state.hasJSXStyle = null
          state.className = null
          state.externalJsxId = null
        }

        if (!state.hasJSXStyle || !isStyledJsx(path)) {
          return
        }

        if (state.ignoreClosing > 1) {
          let styleTagSrc
          try {
            styleTagSrc = path.getSource()
          } catch (error) {
          }

          throw path.buildCodeFrameError(
            'Detected nested style tag' +
            (styleTagSrc ? `: \n\n${ styleTagSrc }\n\n` : ' ') +
            'styled-jsx only allows style tags ' +
            'to be direct descendants (children) of the outermost ' +
            'JSX element i.e. the subtree root.'
          )
        }

        if (
          state.externalStyles.length > 0 &&
          path.get('children').filter(child => {
            if (!t.isJSXExpressionContainer(child)) {
              return false
            }

            const expression = child.get('expression')
            return expression && expression.isIdentifier()
          }).length === 1
        ) {
          const [id, css] = state.externalStyles.shift()

          path.replaceWith(makeStyledJsxTag(id, css, [], path))
          return
        }

        const {vendorPrefixes, sourceMaps} = state.opts
        const stylesInfo = {
          ...state.styles.shift(),
          file: state.file,
          staticClassName: state.staticClassName,
          isGlobal,
          plugins: state.plugins,
          vendorPrefixes,
          sourceMaps
        }
        const splitRules =
          typeof state.opts.optimizeForSpeed === 'boolean'
            ? state.opts.optimizeForSpeed
            : process.env.NODE_ENV === 'production'

        const {hash, css, expressions} = processCss(stylesInfo, {
          splitRules
        })

        path.replaceWith(makeStyledJsxTag(hash, css, expressions, path))
      }
    }
  }

  // only apply JSXFragment visitor if supported
  if (t.isJSXFragment) {
    jsxVisitors.JSXFragment = jsxVisitors.JSXElement
    jsxVisitors.JSXOpeningFragment = {
      enter(path, state) {
        if (!state.hasJSXStyle) {
          return
        }

        if (state.ignoreClosing === null) {
          // We keep a counter of elements inside so that we
          // can keep track of when we exit the parent to reset state
          // note: if we wished to add an option to turn off
          // selectors to reach parent elements, it would suffice to
          // set this to `1` and do an early return instead
          state.ignoreClosing = 0
        }

        state.ignoreClosing++
      }
    }
  }

  const visitors = {
    inherits: jsx,
    visitor: {
      Program: {
        enter(path, state) {
          state.hasJSXStyle = null
          state.ignoreClosing = null

          // if (!state.file.hasJSXStyle) {
          //   state.file.hasJSXStyle = false
          // }

          setStateOptions(state)

          // we need to beat the arrow function transform and
          // possibly others so we traverse from here or else
          // dynamic values in classNames could be incorrect
          path.traverse(jsxVisitors, state)
        },

        exit({node, scope}, state) {
          if (!state.file.HAS_STYLE_JSX_TAG) {
            return
          }

          if (state.file.STYLE_IMPORT_ADDED) {
            return
          }

          if (scope.hasBinding(STYLE_COMPONENT)) {
            return
          }

          state.file.STYLE_IMPORT_ADDED = true
          const importDeclaration = createReactComponentImportDeclaration()
          node.body.unshift(importDeclaration)
        }
      },

      ...externalStylesVisitor
    }
  }

  return visitors
}