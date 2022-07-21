/**
 * @jest-environment jsdom
 */
import { data } from './data'
import { errors } from './errors'
import { response } from '../response'
import { parse } from 'graphql'

test('sets a single data on the response JSON body', async () => {
  const result = await response(data({ name: 'msw' }))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        name: 'msw',
      },
    }),
  )
})

test('sets a single data on the response JSON body when passed documentNode', async () => {
  const documentNode = parse('query { name }')

  const result = await response(data({ name: 'msw' }, documentNode))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        name: 'msw',
      },
    }),
  )
})

test('sets multiple data on the response JSON body', async () => {
  const result = await response(
    data({ name: 'msw' }),
    data({ description: 'API mocking library' }),
  )

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        description: 'API mocking library',
        name: 'msw',
      },
    }),
  )
})

test('sets multiple data on the response JSON body when created with documentNode', async () => {
  const documentNode = parse('query { name description }')

  const result = await response(
    data({ name: 'msw' }, documentNode),
    data({ description: 'API mocking library' }, documentNode),
  )

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        description: 'API mocking library',
        name: 'msw',
      },
    }),
  )
})

test('combines with error in the response JSON body', async () => {
  const result = await response(
    data({ name: 'msw' }),
    errors([
      {
        message: 'exceeds the limit of awesomeness',
      },
    ]),
  )

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      errors: [
        {
          message: 'exceeds the limit of awesomeness',
        },
      ],
      data: {
        name: 'msw',
      },
    }),
  )
})

test('combines with error in the response JSON body when passed documentNode', async () => {
  const documentNode = parse('query { name }')

  const result = await response(
    data({ name: 'msw' }, documentNode),
    errors([
      {
        message: 'exceeds the limit of awesomeness',
      },
    ]),
  )

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      errors: [
        {
          message: 'exceeds the limit of awesomeness',
        },
      ],
      data: {
        name: 'msw',
      },
    }),
  )
})

test('deep picks fields when passed documentNode', async () => {
  const business = {
    __typename: 'Business',
    id: '1357924680',
    name: 'ACME',
    email: 'acme@nomail.com',
    type: 'SME',
  }
  const jill = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    age: 10,
    eldestSibling: null,
    phone: '+1234567890',
  }
  const jack = {
    __typename: 'User',
    id: '1234567890',
    name: 'Jack',
    age: 11,
    eldestSibling: jill,
    phone: '+10987654321',
    emergencyContacts: [jill, business],
  }

  const documentNode = parse(`
    query {
      user {
        __typename
        id
        ...UserRelations
      }
      business {
        id
        type
      }
    }

    fragment UserRelations on User {
      eldestSibling { age }
      emergencyContacts {
        ... on User {
          name
          phone
        }
        ... on Business {
          name
          email
        }
      }
    }
  `)

  const result = await response(data({ user: jack, business }, documentNode))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        user: {
          __typename: jack.__typename,
          id: jack.id,
          eldestSibling: { age: jill.age },
          emergencyContacts: [
            { name: jill.name, phone: jill.phone },
            { name: business.name, email: business.email },
          ],
        },
        business: {
          id: business.id,
          type: business.type,
        },
      },
    }),
  )
})

test('deep picks correct fields when passed documentNode with named operations and an operationName', async () => {
  const jill = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    age: 10,
  }
  const jack = {
    __typename: 'User',
    id: '1234567890',
    name: 'Jack',
    age: 11,
    siblings: [jill],
    eldestSibling: jill,
  }

  const documentNode = parse(`
    query GetUser {
      user {
        __typename
        id
        siblings { name }
        eldestSibling { age }
      }
    }
    query OtherQuery {
      user {
        id
      }
    }
  `)

  const result = await response(data({ user: jack }, documentNode, 'GetUser'))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        user: {
          __typename: 'User',
          id: jack.id,
          siblings: [{ name: jill.name }],
          eldestSibling: { age: jill.age },
        },
      },
    }),
  )
})

test('deep picks fields from payloads with circular references when passed documentNode', async () => {
  type User = {
    __typename: 'User'
    id: string
    name: string
    siblings: User[]
    eldestSibling: User | null
    age: number
  }
  const jill: User = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    siblings: [],
    eldestSibling: null,
    age: 10,
  }
  const jack: User = {
    __typename: 'User',
    id: '1234567890',
    name: 'Jack',
    siblings: [jill],
    eldestSibling: jill,
    age: 11,
  }
  jill.siblings = [jack]
  jill.eldestSibling = jack

  const documentNode = parse(`
    query {
      user {
        name
        siblings { name }
        eldestSibling { age }
      }
    }
  `)

  const result = await response(data({ user: jack }, documentNode))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        user: {
          name: jack.name,
          siblings: [{ name: jill.name }],
          eldestSibling: { age: jill.age },
        },
      },
    }),
  )
})

test('throws when passed documentNode with named operation but no operationName', async () => {
  const jill = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    age: 10,
  }

  const documentNode = parse('query GetUser { user { id } }')

  await expect(response(data({ user: jill }, documentNode))).rejects.toThrow(
    'Unable to find anonymous query, pass operationName to choose an operation',
  )
})

test('throws when passed operationName that does not match an operation in documentNode', async () => {
  const jill = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    age: 10,
  }

  const documentNode = parse('query GetUser { user { id } }')

  await expect(
    response(data({ user: jill }, documentNode, 'UnrelatedQuery')),
  ).rejects.toThrow('Unable to find operation named "UnrelatedQuery"')
})

test('throws when passed payload with circular references when not created with documentNode', async () => {
  type User = {
    __typename: 'User'
    id: string
    name: string
    siblings: User[]
    eldestSibling: User | null
    age: number
  }
  const jill: User = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    siblings: [],
    eldestSibling: null,
    age: 10,
  }
  const jack: User = {
    __typename: 'User',
    id: '1234567890',
    name: 'Jack',
    siblings: [jill],
    eldestSibling: jill,
    age: 11,
  }
  jill.siblings = [jack]
  jill.eldestSibling = jack

  await expect(response(data({ user: jack }))).rejects.toThrow(
    /Converting circular structure to JSON/,
  )
})
