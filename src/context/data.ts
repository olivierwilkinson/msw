import { jsonParse } from '../utils/internal/jsonParse'
import { mergeRight } from '../utils/internal/mergeRight'
import { json } from './json'
import pickOperationFields from '../utils/internal/pickOperationFields'
import { DocumentNode } from 'graphql'
import { ResponseTransformer } from '../response'

/**
 * Sets a given payload as a GraphQL response body.
 * @see {@link https://mswjs.io/docs/api/context/data `ctx.data()`}
 * @example
 * res(ctx.data({ user: { firstName: 'John' }}))
 * @example
 * const document = parse('query { user { firstName } }')
 * res(ctx.data({ user }, document))
 * @example
 * const document = parse('query GetUser { user { firstName } }')
 * res(ctx.data({ user }, document, 'GetUser'))
 * @example
 * const document = parse('query GetUser($id: String!) { user(id: $id) { firstName } }')
 * res(ctx.data({ user }, document, 'GetUser', { id: '123' }))
 */
export const data: (
  payload: Record<string, unknown>,
  document?: DocumentNode,
  operationName?: string,
  variables?: Record<string, unknown>,
) => ResponseTransformer = (payload, document, operationName, variables) => {
  return (res) => {
    let data = payload

    // if possible only respond with fields included in passed operation
    if (payload && typeof payload === 'object' && document) {
      data = pickOperationFields(
        payload,
        document,
        operationName || null,
        variables,
      )
    }

    const prevBody = jsonParse(res.body) || {}
    const nextBody = mergeRight(prevBody, { data })

    return json(nextBody)(res)
  }
}
