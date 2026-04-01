import { ipcMain } from 'electron'
import { ipcHandler } from '../services/IpcHandlerFactory'
import * as DeployService from '../services/DeployService'
import type { DeployPlatform, VercelLink, RailwayLink } from '../shared/types'

export function registerDeployHandlers() {
  ipcMain.handle('deploy:auth-status', ipcHandler(async () => {
    return DeployService.getAuthStatus()
  }))

  ipcMain.handle('deploy:connect-vercel', ipcHandler(async (_event, token: string) => {
    const user = await DeployService.validateVercelToken(token)
    DeployService.storeToken('vercel', token)
    return user
  }))

  ipcMain.handle('deploy:connect-railway', ipcHandler(async (_event, token: string) => {
    const user = await DeployService.validateRailwayToken(token)
    DeployService.storeToken('railway', token)
    return user
  }))

  ipcMain.handle('deploy:disconnect', ipcHandler(async (_event, platform: DeployPlatform) => {
    DeployService.deleteToken(platform)
  }))

  ipcMain.handle('deploy:vercel-projects', ipcHandler(async (_event, teamId?: string) => {
    const token = DeployService.getToken('vercel')
    if (!token) throw new Error('Vercel not connected')
    return DeployService.listVercelProjects(token, teamId)
  }))

  ipcMain.handle('deploy:railway-projects', ipcHandler(async () => {
    const token = DeployService.getToken('railway')
    if (!token) throw new Error('Railway not connected')
    return DeployService.listRailwayProjects(token)
  }))

  ipcMain.handle('deploy:link', ipcHandler(async (
    _event,
    projectId: string,
    platform: DeployPlatform,
    linkData: VercelLink | RailwayLink
  ) => {
    DeployService.linkProject(projectId, platform, linkData)
  }))

  ipcMain.handle('deploy:unlink', ipcHandler(async (_event, projectId: string, platform: DeployPlatform) => {
    DeployService.unlinkProject(projectId, platform)
  }))

  ipcMain.handle('deploy:status', ipcHandler(async (_event, projectId: string) => {
    return DeployService.getDeployStatus(projectId)
  }))

  ipcMain.handle('deploy:deployments', ipcHandler(async (
    _event,
    projectId: string,
    platform: DeployPlatform,
    limit?: number
  ) => {
    const infra = DeployService.getProjectInfra(projectId)
    if (platform === 'vercel') {
      const token = DeployService.getToken('vercel')
      if (!token) throw new Error('Vercel not connected')
      if (!infra.vercel) throw new Error('Vercel not linked to this project')
      return DeployService.listVercelDeployments(token, infra.vercel.projectId, infra.vercel.teamId, limit)
    }
    const token = DeployService.getToken('railway')
    if (!token) throw new Error('Railway not connected')
    if (!infra.railway) throw new Error('Railway not linked to this project')
    return DeployService.listRailwayDeployments(
      token, infra.railway.projectId, infra.railway.serviceId, infra.railway.environmentId, limit
    )
  }))

  ipcMain.handle('deploy:redeploy', ipcHandler(async (_event, projectId: string, platform: DeployPlatform) => {
    const infra = DeployService.getProjectInfra(projectId)
    if (platform === 'vercel') {
      const token = DeployService.getToken('vercel')
      if (!token) throw new Error('Vercel not connected')
      if (!infra.vercel) throw new Error('Vercel not linked to this project')
      return DeployService.triggerVercelRedeploy(token, infra.vercel.projectId, infra.vercel.teamId)
    }
    const token = DeployService.getToken('railway')
    if (!token) throw new Error('Railway not connected')
    if (!infra.railway) throw new Error('Railway not linked to this project')
    return DeployService.triggerRailwayDeploy(token, infra.railway.serviceId, infra.railway.environmentId)
  }))

  ipcMain.handle('deploy:env-vars', ipcHandler(async (_event, projectId: string, platform: DeployPlatform) => {
    const infra = DeployService.getProjectInfra(projectId)
    if (platform === 'vercel') {
      const token = DeployService.getToken('vercel')
      if (!token) throw new Error('Vercel not connected')
      if (!infra.vercel) throw new Error('Vercel not linked to this project')
      return DeployService.listVercelEnvVars(token, infra.vercel.projectId, infra.vercel.teamId)
    }
    const token = DeployService.getToken('railway')
    if (!token) throw new Error('Railway not connected')
    if (!infra.railway) throw new Error('Railway not linked to this project')
    return DeployService.listRailwayVariables(
      token, infra.railway.projectId, infra.railway.environmentId, infra.railway.serviceId
    )
  }))

  ipcMain.handle('deploy:auto-detect', ipcHandler(async (_event, projectPath: string) => {
    const results: Record<string, unknown[]> = {}
    const vercelToken = DeployService.getToken('vercel')
    if (vercelToken) {
      try {
        const r = await DeployService.autoDetectProject(projectPath, vercelToken, 'vercel')
        if (r.vercel) results.vercel = r.vercel
      } catch { /* skip if vercel fails */ }
    }
    const railwayToken = DeployService.getToken('railway')
    if (railwayToken) {
      try {
        const r = await DeployService.autoDetectProject(projectPath, railwayToken, 'railway')
        if (r.railway) results.railway = r.railway
      } catch { /* skip if railway fails */ }
    }
    return results
  }))
}
