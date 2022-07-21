/**
 * @jest-environment jsdom
 */
import { Headers } from 'headers-polyfill'
import { parse } from 'graphql'
import { createMockedRequest } from '../../../test/support/utils'
import { parseGraphQLRequest } from './parseGraphQLRequest'

const LOGIN = 'mutation Login { user { id } }'
const GET_USER =
  'query GetUser($userId: String!) { user(id: $userId) { firstName } }'

test('returns parsed request given a valid GraphQL request', () => {
  // parses GET requests with named mutation
  const getNamedMutationRequest = createMockedRequest({
    method: 'GET',
    url: new URL(
      `http://localhost:8080/graphql?operationName=Login&query=${LOGIN}`,
    ),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  expect(parseGraphQLRequest(getNamedMutationRequest)).toEqual({
    document: parse(LOGIN),
    operationType: 'mutation',
    operationName: 'Login',
    variables: {},
  })

  // parses POST requests with named query and variables
  const postNamedQueryRequest = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: {
      query: GET_USER,
      operationName: 'GetUser',
      variables: { userId: 'abc-123' },
    },
  })
  expect(parseGraphQLRequest(postNamedQueryRequest)).toEqual({
    document: parse(GET_USER),
    operationType: 'query',
    operationName: 'GetUser',
    variables: { userId: 'abc-123' },
  })

  // parses GET requests with shorthand queries
  const getShorthandQueryRequest = createMockedRequest({
    method: 'GET',
    url: new URL('http://localhost:8080/graphql?query={ user { id } }'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  expect(parseGraphQLRequest(getShorthandQueryRequest)).toEqual({
    document: parse('{ user { id } }'),
    operationType: 'query',
    operationName: undefined,
    variables: {},
  })

  // parses POST requests with multiple operations given a name
  const postMultipleOperationsRequest = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: {
      operationName: 'Login',
      query: `${GET_USER} ${LOGIN}`,
    },
  })
  expect(parseGraphQLRequest(postMultipleOperationsRequest)).toEqual({
    document: parse(`${GET_USER} ${LOGIN}`),
    operationType: 'mutation',
    operationName: 'Login',
    variables: {},
  })
})

test('throws an exception given an invalid GraphQL request', () => {
  const getRequest = createMockedRequest({
    method: 'GET',
    url: new URL(
      'http://localhost:8080/graphql?query=mutation Login() { user { {}',
    ),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
  })
  expect(() => parseGraphQLRequest(getRequest)).toThrowError(
    '[MSW] Failed to intercept a GraphQL request to "GET http://localhost:8080/graphql": cannot parse query. See the error message from the parser below.',
  )

  const postRequest = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
    body: {
      query: `query GetUser() { user {{}`,
    },
  })
  expect(() => parseGraphQLRequest(postRequest)).toThrowError(
    '[MSW] Failed to intercept a GraphQL request to "POST http://localhost:8080/graphql": cannot parse query. See the error message from the parser below.\n\nSyntax Error: Expected "$", found ")".',
  )

  const getRequestWithoutOperationName = createMockedRequest({
    method: 'GET',
    url: new URL(`http://localhost:8080/graphql?query=${GET_USER}`),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
  })
  expect(() =>
    parseGraphQLRequest(getRequestWithoutOperationName),
  ).toThrowError(
    '[MSW] Failed to intercept a GraphQL request to "GET http://localhost:8080/graphql": cannot parse query. See the error message from the parser below.\n\nVariable "$userId" of required type "String!" was not provided.',
  )

  const postRequestWithMultipleAnonymous = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
    body: {
      query: `
        query { user { id } }
        query { otherUser { id } }
      `,
    },
  })
  expect(() =>
    parseGraphQLRequest(postRequestWithMultipleAnonymous),
  ).toThrowError(
    '[MSW] Failed to intercept a GraphQL request to "POST http://localhost:8080/graphql": cannot parse query. See the error message from the parser below.\n\nMust provide operation name if query contains multiple operations.',
  )

  const getRequestWithInvalidVariables = createMockedRequest({
    method: 'GET',
    url: new URL(
      `http://localhost:8080/graphql?query=${GET_USER}&operationName=GetUser`,
    ),
    headers: new Headers({
      'Content-Type': 'application/json',
    }),
  })
  expect(() =>
    parseGraphQLRequest(getRequestWithInvalidVariables),
  ).toThrowError(
    '[MSW] Failed to intercept a GraphQL request to "GET http://localhost:8080/graphql": cannot parse query. See the error message from the parser below.\n\nVariable "$userId" of required type "String!" was not provided.',
  )
})

test('returns false given a GraphQL-incompatible request', () => {
  const getRequest = createMockedRequest({
    method: 'GET',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  expect(parseGraphQLRequest(getRequest)).toBeUndefined()

  const postRequest = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: {
      queryUser: true,
    },
  })
  expect(parseGraphQLRequest(postRequest)).toBeUndefined()
})
