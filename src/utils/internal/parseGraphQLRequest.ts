import {
  DocumentNode,
  OperationDefinitionNode,
  OperationTypeNode,
  parse,
} from 'graphql'
import { GraphQLVariables } from '../../handlers/GraphQLHandler'
import { MockedRequest } from '../../handlers/RequestHandler'
import { getPublicUrlFromRequest } from '../request/getPublicUrlFromRequest'
import { devUtils } from './devUtils'
import { jsonParse } from './jsonParse'

interface GraphQLInput {
  query: string | null
  operationName: string | null
  variables?: GraphQLVariables
}

export interface ParsedGraphQLQuery {
  operationType: OperationTypeNode
  operationName?: string
}

export type ParsedGraphQLRequest<
  VariablesType extends GraphQLVariables = GraphQLVariables,
> =
  | (ParsedGraphQLQuery & {
      variables?: VariablesType
    })
  | undefined

export function parseDocumentNode(
  ast: DocumentNode,
  operationName: string | null,
): ParsedGraphQLQuery {
  const operationDefs = ast.definitions.filter(
    (def) => def.kind === 'OperationDefinition',
  ) as OperationDefinitionNode[]

  if (operationDefs.length === 1) {
    const [operationDef] = operationDefs
    const defOperationName = operationDef.name?.value

    if (defOperationName && operationName !== defOperationName) {
      throw new Error(
        `Operation definition "${defOperationName}" does not match passed operation name "${operationName}"`,
      )
    }

    if (!defOperationName && operationName !== null) {
      throw new Error(
        `Anonymous operation definition does not match passed operation name "${operationName}"`,
      )
    }

    return {
      operationType: operationDef?.operation,
      operationName: operationDef?.name?.value,
    }
  }

  // check for anonymous definition
  if (operationDefs.find((def) => !def.name?.value)) {
    throw new Error('Anonymous operations must be the only defined operation.')
  }

  // find the operation definition to use using operationName
  const operationDef = operationDefs.find(
    (def) => def.name?.value === operationName,
  )
  if (!operationDef) {
    throw new Error(
      `Multiple operation definitions found but none match passed operation name "${operationName}"`,
    )
  }

  return {
    operationType: operationDef?.operation,
    operationName: operationDef?.name?.value,
  }
}

function parseQuery(
  query: string,
  operationName: string | null,
): ParsedGraphQLQuery | Error {
  try {
    const ast = parse(query)
    return parseDocumentNode(ast, operationName)
  } catch (error) {
    return error as Error
  }
}

export type GraphQLParsedOperationsMap = Record<string, string[]>
export type GraphQLMultipartRequestBody = {
  operations: string
  map?: string
} & {
  [fileName: string]: File
}

function extractMultipartVariables<VariablesType extends GraphQLVariables>(
  variables: VariablesType,
  map: GraphQLParsedOperationsMap,
  files: Record<string, File>,
) {
  const operations = { variables }
  for (const [key, pathArray] of Object.entries(map)) {
    if (!(key in files)) {
      throw new Error(`Given files do not have a key '${key}' .`)
    }

    for (const dotPath of pathArray) {
      const [lastPath, ...reversedPaths] = dotPath.split('.').reverse()
      const paths = reversedPaths.reverse()
      let target: Record<string, any> = operations

      for (const path of paths) {
        if (!(path in target)) {
          throw new Error(`Property '${paths}' is not in operations.`)
        }

        target = target[path]
      }

      target[lastPath] = files[key]
    }
  }
  return operations.variables
}

function getGraphQLInput(request: MockedRequest<any>): GraphQLInput | null {
  switch (request.method) {
    case 'GET': {
      const query = request.url.searchParams.get('query')
      const operationName = request.url.searchParams.get('operationName')
      const variables = request.url.searchParams.get('variables') || ''

      return {
        query,
        operationName,
        variables: jsonParse(variables),
      }
    }

    case 'POST': {
      if (request.body?.query) {
        const { query, variables, operationName } = request.body

        return {
          query,
          variables,
          operationName,
        }
      }

      // Handle multipart body operations.
      if (request.body?.operations) {
        const { operations, map, ...files } =
          request.body as GraphQLMultipartRequestBody
        const parsedOperations =
          jsonParse<{
            query?: string
            variables?: GraphQLVariables
            operationName?: string
          }>(operations) || {}

        if (!parsedOperations.query) {
          return null
        }

        const parsedMap = jsonParse<GraphQLParsedOperationsMap>(map || '') || {}
        const variables = parsedOperations.variables
          ? extractMultipartVariables(
              parsedOperations.variables,
              parsedMap,
              files,
            )
          : {}

        return {
          query: parsedOperations.query,
          variables,
          operationName: parsedOperations.operationName || null,
        }
      }
    }

    default:
      return null
  }
}

/**
 * Determines if a given request can be considered a GraphQL request.
 * Does not parse the query and does not guarantee its validity.
 */
export function parseGraphQLRequest(
  request: MockedRequest<any>,
): ParsedGraphQLRequest {
  const input = getGraphQLInput(request)

  if (!input || !input.query) {
    return undefined
  }

  const { query, variables, operationName } = input
  const parsedResult = parseQuery(query, operationName)

  if (parsedResult instanceof Error) {
    const requestPublicUrl = getPublicUrlFromRequest(request)

    throw new Error(
      devUtils.formatMessage(
        'Failed to intercept a GraphQL request to "%s %s": cannot parse query. See the error message from the parser below.\n\n%s',
        request.method,
        requestPublicUrl,
        parsedResult.message,
      ),
    )
  }

  return {
    operationType: parsedResult.operationType,
    operationName: parsedResult.operationName,
    variables,
  }
}
