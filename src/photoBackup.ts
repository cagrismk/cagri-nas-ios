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
}

export const PhotoBackup =
  registerPlugin<PhotoBackupPlugin>('PhotoBackup');

export async function checkPhotoLibrary(): Promise<PhotoLibraryInfo> {
  return PhotoBackup.getLibraryInfo();
}
