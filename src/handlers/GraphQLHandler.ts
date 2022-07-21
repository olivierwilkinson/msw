import { DocumentNode, OperationTypeNode } from 'graphql'
import { SerializedResponse } from '../setupWorker/glossary'
import { data } from '../context/data'
import { extensions } from '../context/extensions'
import { errors } from '../context/errors'
import { field } from '../context/field'
import { GraphQLPayloadContext } from '../typeUtils'
import { cookie } from '../context/cookie'
import {
  defaultContext,
  DefaultContext,
  MockedRequest,
  RequestHandler,
  RequestHandlerDefaultInfo,
  ResponseResolver,
} from './RequestHandler'
import { getTimestamp } from '../utils/logging/getTimestamp'
import { getStatusCodeColor } from '../utils/logging/getStatusCodeColor'
import { prepareRequest } from '../utils/logging/prepareRequest'
import { prepareResponse } from '../utils/logging/prepareResponse'
import { matchRequestUrl, Path } from '../utils/matching/matchRequestUrl'
import {
  ParsedGraphQLRequest,
  GraphQLMultipartRequestBody,
  parseGraphQLRequest,
  parseDocumentNode,
} from '../utils/internal/parseGraphQLRequest'
import { getPublicUrlFromRequest } from '../utils/request/getPublicUrlFromRequest'
import { tryCatch } from '../utils/internal/tryCatch'
import { devUtils } from '../utils/internal/devUtils'

export type ExpectedOperationTypeNode = OperationTypeNode | 'all'
export type GraphQLHandlerNameSelector = DocumentNode | RegExp | string

// GraphQL related context should contain utility functions
// useful for GraphQL. Functions like `xml()` bear no value
// in the GraphQL universe.
export type GraphQLContext<QueryType extends Record<string, unknown>> =
  DefaultContext & {
    data: typeof data
    extensions: GraphQLPayloadContext<QueryType>
    errors: typeof errors
    cookie: typeof cookie
    field: typeof field
  }

export type ResolverGraphQLContext<QueryType extends Record<string, unknown>> =
  Omit<GraphQLContext<QueryType>, 'data'> & {
    data: GraphQLPayloadContext<QueryType>
  }

export const graphqlContext: GraphQLContext<any> = {
  ...defaultContext,
  data,
  extensions,
  errors,
  cookie,
  field,
}

export type GraphQLVariables = Record<string, any>

export interface GraphQLHandlerInfo extends RequestHandlerDefaultInfo {
  operationType: ExpectedOperationTypeNode
  operationSelector: GraphQLHandlerNameSelector
}

export type GraphQLRequestBody<VariablesType extends GraphQLVariables> =
  | GraphQLJsonRequestBody<VariablesType>
  | GraphQLMultipartRequestBody
  | Record<string, any>
  | undefined

export interface GraphQLJsonRequestBody<Variables extends GraphQLVariables> {
  query: string
  operationName: string | undefined
  variables?: Variables
}

export interface GraphQLRequest<Variables extends GraphQLVariables>
  extends MockedRequest<GraphQLRequestBody<Variables>> {
  variables: Variables
}

export function isDocumentNode(
  value: DocumentNode | any,
): value is DocumentNode {
  if (value == null) {
    return false
  }

  return typeof value === 'object' && 'kind' in value && 'definitions' in value
}

export class GraphQLHandler<
  Request extends GraphQLRequest<any> = GraphQLRequest<any>,
> extends RequestHandler<
  GraphQLHandlerInfo,
  Request,
  ParsedGraphQLRequest | undefined,
  GraphQLRequest<any>
> {
  private endpoint: Path

  constructor(
    operationType: ExpectedOperationTypeNode,
    operationSelector: GraphQLHandlerNameSelector,
    endpoint: Path,
    resolver: ResponseResolver<any, any>,
  ) {
    let resolvedOperationSelector = operationSelector

    if (isDocumentNode(operationSelector)) {
      // pass null for operationName as using a document node with
      // multiple operation definitions as a selector is not supported
      const parsedNode = parseDocumentNode(operationSelector, null)

      if (parsedNode.operationType !== operationType) {
        throw new Error(
          `Failed to create a GraphQL handler: provided a DocumentNode with a mismatched operation type (expected "${operationType}", but got "${parsedNode.operationType}").`,
        )
      }

      if (!parsedNode.operationName) {
        throw new Error(
          `Failed to create a GraphQL handler: provided a DocumentNode with no operation name.`,
        )
      }

      resolvedOperationSelector = parsedNode.operationName
    }

    const header =
      operationType === 'all'
        ? `${operationType} (origin: ${endpoint.toString()})`
        : `${operationType} ${resolvedOperationSelector} (origin: ${endpoint.toString()})`

    super({
      info: {
        header,
        operationType,
        operationSelector: resolvedOperationSelector,
      },
      resolver,
    })

    this.endpoint = endpoint
  }

  parse(request: MockedRequest) {
    return tryCatch(
      () => parseGraphQLRequest(request),
      (error) => console.error(error.message),
    )
  }

  protected getPublicRequest(
    request: Request,
    parsedResult: ParsedGraphQLRequest,
  ): GraphQLRequest<any> {
    return {
      ...request,
      variables: parsedResult?.variables || {},
    }
  }

  predicate(request: MockedRequest, parsedResult?: ParsedGraphQLRequest) {
    if (!parsedResult) {
      return false
    }

    if (!parsedResult.operationName && this.info.operationType !== 'all') {
      const publicUrl = getPublicUrlFromRequest(request)
      devUtils.warn(`\
Failed to intercept a GraphQL request at "${request.method} ${publicUrl}": anonymous GraphQL operations are not supported.

Consider naming this operation or using "graphql.operation" request handler to intercept GraphQL requests regardless of their operation name/type. Read more: https://mswjs.io/docs/api/graphql/operation\
      `)
      return false
    }

    const hasMatchingUrl = matchRequestUrl(request.url, this.endpoint)
    const hasMatchingOperationType =
      this.info.operationType === 'all' ||
      parsedResult.operationType === this.info.operationType

    const hasMatchingOperationName =
      this.info.operationSelector instanceof RegExp
        ? this.info.operationSelector.test(parsedResult.operationName || '')
        : parsedResult.operationName === this.info.operationSelector

    return (
      hasMatchingUrl.matches &&
      hasMatchingOperationType &&
      hasMatchingOperationName
    )
  }

  createContext(parsedRequest: ParsedGraphQLRequest<GraphQLVariables>) {
    return {
      ...graphqlContext,
      data: (payload: Record<string, unknown>) =>
        data(
          payload,
          parsedRequest.document,
          parsedRequest.operationName,
          parsedRequest.variables,
        ),
    }
  }

  log(
    request: Request,
    response: SerializedResponse,
    handler: this,
    parsedRequest: ParsedGraphQLRequest,
  ) {
    const loggedRequest = prepareRequest(request)
    const loggedResponse = prepareResponse(response)
    const statusColor = getStatusCodeColor(response.status)
    const requestInfo = parsedRequest?.operationName
      ? `${parsedRequest?.operationType} ${parsedRequest?.operationName}`
      : `anonymous ${parsedRequest?.operationType}`

    console.groupCollapsed(
      devUtils.formatMessage('%s %s (%c%s%c)'),
      getTimestamp(),
      `${requestInfo}`,
      `color:${statusColor}`,
      `${response.status} ${response.statusText}`,
      'color:inherit',
    )
    console.log('Request:', loggedRequest)
    console.log('Handler:', this)
    console.log('Response:', loggedResponse)
    console.groupEnd()
  }
}
