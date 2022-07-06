import { jsonParse } from '../utils/internal/jsonParse'
import { mergeRight } from '../utils/internal/mergeRight'
import { json } from './json'
import pickOperationFields from '../utils/internal/pickOperationFields'
import { DocumentNode } from 'graphql'
import { ResponseTransformer } from '../response'

export const createData = (
  documentNode: DocumentNode,
  operationName?: string,
) => {
  /**
   * Sets a given payload as a GraphQL response body.
   * @example
   * res(ctx.data({ user: { firstName: 'John' }}))
   * @see {@link https://mswjs.io/docs/api/context/data `ctx.data()`}
   */
  const data: (payload: Record<string, unknown>) => ResponseTransformer = (
    payload,
  ) => {
    return (res) => {
      const prevBody = jsonParse(res.body) || {}
      const nextBody = mergeRight(prevBody, {
        data: pickOperationFields(payload, documentNode, operationName || null),
      })

      return json(nextBody)(res)
    }
  }

  return data
}
