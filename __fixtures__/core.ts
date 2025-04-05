import type * as core from '@actions/core'
import { jest } from '@jest/globals'

export const debug = jest.fn<typeof core.debug>()
export const info = jest.fn<typeof core.info>()
export const warning = jest.fn<typeof core.warning>()
export const error = jest.fn<typeof core.error>()

export const getInput = jest.fn<typeof core.getInput>()
export const setOutput = jest.fn<typeof core.setOutput>()
export const setSecret = jest.fn<typeof core.setSecret>()
export const setFailed = jest.fn<typeof core.setFailed>()

export const getIDToken = jest.fn<typeof core.getIDToken>()
