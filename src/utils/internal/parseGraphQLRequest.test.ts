/**
 * @jest-environment jsdom
 */
import { Headers } from 'headers-polyfill'
import { createMockedRequest } from '../../../test/support/utils'
import { parseGraphQLRequest } from './parseGraphQLRequest'

test('returns parsed request given a valid GraphQL request', () => {
  // parses GET requests with named mutation
  const getNamedMutationRequest = createMockedRequest({
    method: 'GET',
    url: new URL(
      'http://localhost:8080/graphql?operationName=Login&query=mutation Login { user { id } }',
    ),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  expect(parseGraphQLRequest(getNamedMutationRequest)).toEqual({
    operationType: 'mutation',
    operationName: 'Login',
    variables: undefined,
  })

  // parses POST requests with named query
  const postNamedQueryRequest = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: {
      query: `query GetUser { user { firstName } }`,
      operationName: 'GetUser',
    },
  })
  expect(parseGraphQLRequest(postNamedQueryRequest)).toEqual({
    operationType: 'query',
    operationName: 'GetUser',
    variables: undefined,
  })

  // parses GET requests with shorthand queries
  const getShorthandQueryRequest = createMockedRequest({
    method: 'GET',
    url: new URL('http://localhost:8080/graphql?query={ user { id } }'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  expect(parseGraphQLRequest(getShorthandQueryRequest)).toEqual({
    operationType: 'query',
    operationName: undefined,
    variables: undefined,
  })

  // parses POST requests with multiple operations given a name
  const postMultipleOperationsRequest = createMockedRequest({
    method: 'POST',
    url: new URL('http://localhost:8080/graphql'),
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: {
      operationName: 'Login',
      query: `
        query GetUser { user { firstName } }
        mutation Login { user { id } }
      `,
    },
  })
  expect(parseGraphQLRequest(postMultipleOperationsRequest)).toEqual({
    operationType: 'mutation',
    operationName: 'Login',
    variables: undefined,
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
    '[MSW] Failed to intercept a GraphQL request to "POST http://localhost:8080/graphql": cannot parse query. See the error message from the parser below.\n\nAnonymous operations must be the only defined operation.',
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
