/**
 * @jest-environment jsdom
 */
import { OperationTypeNode, parse } from 'graphql'
import { Headers } from 'headers-polyfill/lib'
import { context } from '..'
import { createMockedRequest } from '../../test/support/utils'
import { response } from '../response'
import {
  GraphQLContext,
  GraphQLHandler,
  GraphQLRequest,
  GraphQLRequestBody,
  isDocumentNode,
} from './GraphQLHandler'
import { MockedRequest, ResponseResolver } from './RequestHandler'
import { silenceErrorLogs } from '../../test/support/silenceErrorLogs'

const resolver: ResponseResolver<
  GraphQLRequest<{ userId: string }>,
  GraphQLContext<any>
> = (req, res, ctx) => {
  return res(
    ctx.data({
      user: { id: req.variables.userId },
    }),
  )
}

function createGetGraphQLRequest(
  body: GraphQLRequestBody<any>,
  hostname = 'https://example.com',
) {
  const requestUrl = new URL(hostname)
  requestUrl.searchParams.set('query', body?.query)
  requestUrl.searchParams.set('variables', JSON.stringify(body?.variables))
  requestUrl.searchParams.set('operationName', body?.operationName)
  return createMockedRequest({
    url: requestUrl,
  })
}

function createPostGraphQLRequest(
  body: GraphQLRequestBody<any>,
  hostname = 'https://example.com',
  initMockedRequest: Partial<MockedRequest> = {},
) {
  return createMockedRequest({
    method: 'POST',
    url: new URL(hostname),
    ...initMockedRequest,
    headers: new Headers({ 'Content-Type': 'application/json ' }),
    body,
  })
}

const GET_ALL_USERS = `
  query GetAllUsers {
    users {
      id
    }
  }
`

const GET_USER = `
  query GetUser($userId: String!) {
    user(id: $userId) {
      id
    }
  }
`

const LOGIN = `
  mutation Login {
    user {
      id
    }
  }
`

const UPDATE_USER = `
  mutation UpdateUser($userId: String! $firstName: String!) {
    updateUser(id: $userId firstName: $firstName) {
      id
      firstName
    }
  }
`

describe('info', () => {
  test('exposes request handler information for query', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetUser',
      '*',
      resolver,
    )

    expect(handler.info.header).toEqual('query GetUser (origin: *)')
    expect(handler.info.operationType).toEqual('query')
    expect(handler.info.operationSelector).toEqual('GetUser')
  })

  test('exposes request handler information for mutation', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.MUTATION,
      'Login',
      '*',
      resolver,
    )

    expect(handler.info.header).toEqual('mutation Login (origin: *)')
    expect(handler.info.operationType).toEqual('mutation')
    expect(handler.info.operationSelector).toEqual('Login')
  })

  test('parses a query operation name from a given DocumentNode', () => {
    const node = parse(`
      query GetUser {
        user {
          firstName
        }
      }
    `)

    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      node,
      '*',
      resolver,
    )

    expect(handler.info).toHaveProperty('header', 'query GetUser (origin: *)')
    expect(handler.info).toHaveProperty('operationType', 'query')
    expect(handler.info).toHaveProperty('operationSelector', 'GetUser')
  })

  test('parses a mutation operation name from a given DocumentNode', () => {
    const node = parse(`
      mutation Login {
        user {
          id
        }
      }
    `)
    const handler = new GraphQLHandler(
      OperationTypeNode.MUTATION,
      node,
      '*',
      resolver,
    )

    expect(handler.info).toHaveProperty('header', 'mutation Login (origin: *)')
    expect(handler.info).toHaveProperty('operationType', 'mutation')
    expect(handler.info).toHaveProperty('operationSelector', 'Login')
  })

  test('throws an exception given a DocumentNode with a mismatched operation type', () => {
    const node = parse(`
      mutation CreateUser {
        user {
          firstName
        }
      }
    `)

    expect(
      () => new GraphQLHandler(OperationTypeNode.QUERY, node, '*', resolver),
    ).toThrow(
      'Failed to create a GraphQL handler: provided a DocumentNode with a mismatched operation type (expected "query", but got "mutation").',
    )
  })
})

describe('parse', () => {
  describe('query', () => {
    test('parses a query without variables (GET)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.QUERY,
        'GetAllUsers',
        '*',
        resolver,
      )
      const request = createGetGraphQLRequest({
        query: GET_ALL_USERS,
        operationName: 'GetAllUsers',
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'query',
        operationName: 'GetAllUsers',
        document: parse(GET_ALL_USERS),
        variables: {},
      })
    })

    test('parses a query with variables (GET)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.QUERY,
        'GetUser',
        '*',
        resolver,
      )
      const request = createGetGraphQLRequest({
        query: GET_USER,
        operationName: 'GetUser',
        variables: {
          userId: 'abc-123',
        },
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        document: parse(GET_USER),
        variables: {
          userId: 'abc-123',
        },
      })
    })

    test('parses a query without variables (POST)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.QUERY,
        'GetAllUsers',
        '*',
        resolver,
      )
      const request = createPostGraphQLRequest({
        query: GET_ALL_USERS,
        operationName: 'GetAllUsers',
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'query',
        operationName: 'GetAllUsers',
        document: parse(GET_ALL_USERS),
        variables: {},
      })
    })

    test('parses a query with variables (POST)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.QUERY,
        'GetUser',
        '*',
        resolver,
      )
      const request = createPostGraphQLRequest({
        query: GET_USER,
        variables: {
          userId: 'abc-123',
        },
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'query',
        operationName: 'GetUser',
        document: parse(GET_USER),
        variables: {
          userId: 'abc-123',
        },
      })
    })

    test('parses a query with multiple operations when operation name passed', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.QUERY,
        'GetAllUsers',
        '*',
        resolver,
      )

      const query = `
        ${GET_ALL_USERS}
        ${LOGIN}
      `
      const request = createPostGraphQLRequest({
        query,
        operationName: 'GetAllUsers',
      })
      const alienRequest = createPostGraphQLRequest({
        query,
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'query',
        operationName: 'GetAllUsers',
        document: parse(query),
        variables: {},
      })
      expect(
        silenceErrorLogs(() => handler.parse(alienRequest)),
      ).toBeUndefined()
    })
  })

  describe('mutation', () => {
    test('parses a mutation without variables (GET)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.MUTATION,
        'PingPong',
        '*',
        resolver,
      )
      const query = `
        mutation PingPong {
          pingPong {
            id
          }
        }
      `
      const request = createGetGraphQLRequest({
        query,
        operationName: 'PingPong',
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'mutation',
        operationName: 'PingPong',
        document: parse(query),
        variables: {},
      })
    })

    test('parses a mutation with variables (GET)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.MUTATION,
        'UpdateUser',
        '*',
        resolver,
      )
      const request = createGetGraphQLRequest({
        query: UPDATE_USER,
        operationName: 'UpdateUser',
        variables: {
          userId: 'abc-123',
          firstName: 'Jack',
        },
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'mutation',
        operationName: 'UpdateUser',
        document: parse(UPDATE_USER),
        variables: {
          userId: 'abc-123',
          firstName: 'Jack',
        },
      })
    })

    test('parses a mutation without variables (POST)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.MUTATION,
        'Login',
        '*',
        resolver,
      )
      const request = createPostGraphQLRequest({
        query: LOGIN,
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'mutation',
        operationName: 'Login',
        document: parse(LOGIN),
        variables: {},
      })
    })

    test('parses a mutation with variables (POST)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.MUTATION,
        'UpdateUser',
        '*',
        resolver,
      )

      const request = createPostGraphQLRequest({
        query: UPDATE_USER,
        variables: {
          userId: 'abc-123',
          firstName: 'Jack',
        },
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'mutation',
        operationName: 'UpdateUser',
        document: parse(UPDATE_USER),
        variables: {
          userId: 'abc-123',
          firstName: 'Jack',
        },
      })
    })

    test('parses a mutation with multiple operations when operation name passed', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.MUTATION,
        'Login',
        '*',
        resolver,
      )

      const query = `
        ${LOGIN}
        mutation OtherMutation { id }
      `
      const request = createPostGraphQLRequest({
        query,
        operationName: 'Login',
      })
      const alienRequest = createPostGraphQLRequest({
        query,
      })

      expect(handler.parse(request)).toEqual({
        operationType: 'mutation',
        operationName: 'Login',
        document: parse(query),
        variables: {},
      })
      expect(handler.parse(alienRequest)).toBe(undefined)
    })

    test('fails to parse a mutation with incorrect variables (POST)', () => {
      const handler = new GraphQLHandler(
        OperationTypeNode.MUTATION,
        'UpdateUser',
        '*',
        resolver,
      )
      const query = `
        mutation UpdateUser($userId: String! $firstName: String!) {
          updateUser(id: $userId firstName: $firstName) {
            id
            firstName
          }
        }
      `
      const request = createPostGraphQLRequest({
        query,
        variables: {
          userId: 'abc-123',
        },
      })

      expect(handler.parse(request)).toBeUndefined()
    })
  })
})

describe('predicate', () => {
  test('respects operation type', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetAllUsers',
      '*',
      resolver,
    )
    const request = createPostGraphQLRequest({
      query: GET_ALL_USERS,
      operationName: 'GetAllUsers',
    })
    const alienRequest = createPostGraphQLRequest({
      query: LOGIN,
      operationName: 'Login',
    })

    expect(handler.predicate(request, handler.parse(request))).toBe(true)
    expect(handler.predicate(alienRequest, handler.parse(alienRequest))).toBe(
      false,
    )
  })

  test('respects operation name', () => {
    const query = `
      ${GET_ALL_USERS}
      query OtherQuery { other { id } }
    `
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetAllUsers',
      '*',
      resolver,
    )
    const request = createPostGraphQLRequest({
      query,
      operationName: 'GetAllUsers',
    })
    const alienRequest = createPostGraphQLRequest({
      query,
      operationName: 'OtherQuery',
    })

    expect(handler.predicate(request, handler.parse(request))).toBe(true)
    expect(handler.predicate(alienRequest, handler.parse(alienRequest))).toBe(
      false,
    )
  })

  test('allows anonymous GraphQL opertaions when using "all" expected operation type', () => {
    const handler = new GraphQLHandler('all', new RegExp('.*'), '*', resolver)
    const request = createPostGraphQLRequest({
      query: `
        query {
          anonymousQuery {
            query
            variables
          }
        }
      `,
    })

    expect(handler.predicate(request, handler.parse(request))).toBe(true)
  })

  test('respects custom endpoint', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetAllUsers',
      'https://api.github.com/graphql',
      resolver,
    )
    const request = createPostGraphQLRequest(
      {
        query: GET_ALL_USERS,
        operationName: 'GetAllUsers',
      },
      'https://api.github.com/graphql',
    )
    const alienRequest = createPostGraphQLRequest({
      query: GET_ALL_USERS,
      operationName: 'GetAllUsers',
    })

    expect(handler.predicate(request, handler.parse(request))).toBe(true)
    expect(handler.predicate(alienRequest, handler.parse(alienRequest))).toBe(
      false,
    )
  })

  test('returns false when parsedResult is undefined', () => {
    const handler = new GraphQLHandler('all', 'GetUser', '*', resolver)

    const request = createPostGraphQLRequest({
      query: GET_ALL_USERS,
      operationName: 'GetAllUsers',
    })

    expect(handler.predicate(request, undefined))
  })
})

describe('test', () => {
  test('respects operation type', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetAllUsers',
      '*',
      resolver,
    )
    const request = createPostGraphQLRequest({
      query: GET_ALL_USERS,
      operationName: 'GetAllUsers',
    })
    const alienRequest = createPostGraphQLRequest({
      query: LOGIN,
      operationName: 'Login',
    })

    expect(handler.test(request)).toBe(true)
    expect(silenceErrorLogs(() => handler.test(alienRequest))).toBe(false)
  })

  test('respects operation name', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetAllUsers',
      '*',
      resolver,
    )
    const request = createPostGraphQLRequest({
      query: GET_ALL_USERS,
      operationName: 'GetAllUsers',
    })
    const alienRequest = createPostGraphQLRequest({
      query: `query OtherQuery { other { id } }`,
      operationName: 'OtherQuery',
    })

    expect(handler.test(request)).toBe(true)
    expect(silenceErrorLogs(() => handler.test(alienRequest))).toBe(false)
  })

  test('respects custom endpoint', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetAllUsers',
      'https://api.github.com/graphql',
      resolver,
    )
    const request = createPostGraphQLRequest(
      {
        query: GET_ALL_USERS,
        operationName: 'GetAllUsers',
      },
      'https://api.github.com/graphql',
    )
    const alienRequest = createPostGraphQLRequest({
      query: GET_ALL_USERS,
      operationName: 'GetAllUsers',
    })

    expect(handler.test(request)).toBe(true)
    expect(silenceErrorLogs(() => handler.test(alienRequest))).toBe(false)
  })

  test('respects queries with multiple operations when also provided a operation name', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      new RegExp('.*'),
      '*',
      resolver,
    )

    const query = `${GET_ALL_USERS} query OtherQuery { id }`
    const request = createPostGraphQLRequest({
      query,
      operationName: 'GetAllUsers',
    })
    const alienRequest = createPostGraphQLRequest({
      query,
    })

    expect(handler.test(request)).toBe(true)
    expect(silenceErrorLogs(() => handler.test(alienRequest))).toBe(false)
  })

  test('respects mutations with multiple operations when also provided a operation name', () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.MUTATION,
      new RegExp('.*'),
      '*',
      resolver,
    )

    const query = `${LOGIN} mutation OtherMutation { id }`
    const request = createPostGraphQLRequest({
      query,
      operationName: 'Login',
    })
    const alienRequest = createPostGraphQLRequest({
      query,
    })

    expect(handler.test(request)).toBe(true)
    expect(silenceErrorLogs(() => handler.test(alienRequest))).toBe(false)
  })
})

describe('run', () => {
  test('returns a mocked response given a matching query', async () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetUser',
      '*',
      resolver,
    )
    const request = createPostGraphQLRequest({
      query: GET_USER,
      variables: {
        userId: 'abc-123',
      },
    })
    const result = await handler.run(request)
    const document = parse(GET_USER)

    expect(result).toEqual({
      handler,
      request: {
        ...request,
        variables: {
          userId: 'abc-123',
        },
      },
      parsedResult: {
        operationType: 'query',
        operationName: 'GetUser',
        document,
        variables: {
          userId: 'abc-123',
        },
      },
      response: await response(
        context.data({ user: { id: 'abc-123' } }, document, 'GetUser'),
      ),
    })
  })

  test('returns null given a non-matching query', async () => {
    const handler = new GraphQLHandler(
      OperationTypeNode.QUERY,
      'GetUser',
      '*',
      resolver,
    )
    const request = createPostGraphQLRequest({
      query: LOGIN,
    })
    const result = await handler.run(request)

    expect(result).toBeNull()
  })
})

describe('isDocumentNode', () => {
  it('returns true given a valid DocumentNode', () => {
    const node = parse(`
      query GetUser {
        user {
          login
        }
      }
    `)

    expect(isDocumentNode(node)).toEqual(true)
  })

  it('returns false given an arbitrary input', () => {
    expect(isDocumentNode(null)).toEqual(false)
    expect(isDocumentNode(undefined)).toEqual(false)
    expect(isDocumentNode('')).toEqual(false)
    expect(isDocumentNode('value')).toEqual(false)
    expect(isDocumentNode(/value/)).toEqual(false)
  })
})
