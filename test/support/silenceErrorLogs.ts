export function silenceErrorLogs<T>(cb: () => T) {
  let consoleErrorSpy: jest.SpyInstance
  try {
    consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    return cb()
  } finally {
    consoleErrorSpy.mockRestore()
  }
}
