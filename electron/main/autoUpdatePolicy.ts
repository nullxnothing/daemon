type AutoUpdateContext = {
  isPackaged: boolean
  isDisabled: boolean
  isSmokeTest: boolean
  isAdHocMacBuild: boolean
}

export function shouldEnableAutoUpdate(context: AutoUpdateContext) {
  return context.isPackaged
    && !context.isDisabled
    && !context.isSmokeTest
    && !context.isAdHocMacBuild
}
