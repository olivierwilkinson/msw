/**
 * @jest-environment jsdom
 */
import { createData } from './data'
import { errors } from './errors'
import { response } from '../response'
import { parse } from 'graphql'

test('sets a single data on the response JSON body', async () => {
  const data = createData()

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

test('sets a single data on the response JSON body when created with documentNode', async () => {
  const data = createData(parse('query { name }'))

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

test('sets multiple data on the response JSON body', async () => {
  const data = createData()

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
  const data = createData(documentNode)

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

test('combines with error in the response JSON body', async () => {
  const data = createData()

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

test('combines with error in the response JSON body when created with documentNode', async () => {
  const data = createData(parse('query { name }'))

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

test('deep picks fields when created with documentNode with anonymous query', async () => {
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

  const data = createData(
    parse(
      'query { user { __typename id siblings { name } eldestSibling { age }  } }',
    ),
  )

  const result = await response(data({ user: jack }))

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

test('deep picks fields when documentNode with anonymous mutation passed', async () => {
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

  const data = createData(
    parse(
      'mutation { user { __typename id siblings { name } eldestSibling { age }  } }',
    ),
  )

  const result = await response(data({ user: jack }))

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

test('deep picks fields when created with documentNode with named operations and an operationName', async () => {
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
  const data = createData(documentNode, 'GetUser')

  const result = await response(data({ user: jack }))

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

test('deep picks fields when created with documentNode with a fragment', async () => {
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
    query {
      user {
        __typename
        id
        siblings { ...Sibling }
        eldestSibling { ...Sibling }
      }
    }

    fragment Sibling on User {
      name
      age
    }
  `)
  const data = createData(documentNode)

  const result = await response(data({ user: jack }))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        user: {
          __typename: 'User',
          id: jack.id,
          siblings: [{ name: jill.name, age: jill.age }],
          eldestSibling: { name: jill.name, age: jill.age },
        },
      },
    }),
  )
})

test('deep picks fields when created with documentNode with nested fragments', async () => {
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
    query {
      user {
        __typename
        id
        siblings { ...Sibling }
        eldestSibling { ...Sibling }
      }
    }

    fragment SiblingRelations on User {
      siblings { ...Sibling }
      eldestSibling { ...Sibling }
    }

    fragment Sibling on User {
      name
      age
    }
  `)
  const data = createData(documentNode)

  const result = await response(data({ user: jack }))

  expect(result.headers.get('content-type')).toBe('application/json')
  expect(result).toHaveProperty(
    'body',
    JSON.stringify({
      data: {
        user: {
          __typename: 'User',
          id: jack.id,
          siblings: [{ name: jill.name, age: jill.age }],
          eldestSibling: { name: jill.name, age: jill.age },
        },
      },
    }),
  )
})

test('deep picks fields from payloads with circular references when created with documentNode', async () => {
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

  const data = createData(
    parse('query { user { name siblings { name } eldestSibling { age } } }'),
  )

  const result = await response(data({ user: jack }))

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

test('throws when created with documentNode with named operation but no operationName', async () => {
  const jill = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    age: 10,
  }

  const data = createData(parse('query GetUser { user { id } }'))

  await expect(response(data({ user: jill }))).rejects.toThrow(
    'Unable to find anonymous query, pass operationName to choose an operation',
  )
})

test('throws when created with documentNode with named operation and a non-matching operationName', async () => {
  const jill = {
    __typename: 'User',
    id: '0987654321',
    name: 'Jill',
    age: 10,
  }

  const data = createData(
    parse('query GetUser { user { id } }'),
    'UnrelatedQuery',
  )

  await expect(response(data({ user: jill }))).rejects.toThrow(
    'Unable to find operation named "UnrelatedQuery"',
  )
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

  const data = createData()

  await expect(response(data({ user: jack }))).rejects.toThrow(
    /Converting circular structure to JSON/,
  )
})
