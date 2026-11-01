import { registerPlugin } from '@capacitor/core';

export interface PhotoLibraryInfo {
  authorized: boolean;
  limited?: boolean;
  status?: string;
  photos?: number;
  videos?: number;
  total?: number;
}

export interface PhotoBackupPlugin {
  getLibraryInfo(): Promise<PhotoLibraryInfo>;
  listAssets(): Promise<PhotoAssetList>;
}

export const PhotoBackup =
  registerPlugin<PhotoBackupPlugin>('PhotoBackup');

export async function checkPhotoLibrary(): Promise<PhotoLibraryInfo> {
  return PhotoBackup.getLibraryInfo();
}


export interface PhotoAsset {
  id: string;
  type: "photo" | "video";
  createdAt: number;
  width: number;
  height: number;
}

export interface PhotoAssetList {
  assets: PhotoAsset[];
  total: number;
  limited: boolean;
}

export async function listPhotoAssets(): Promise<PhotoAssetList> {
  return PhotoBackup.listAssets();
}