import Foundation
import Capacitor
import Photos

@objc(PhotoBackupPlugin)
public class PhotoBackupPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "PhotoBackupPlugin"
    public let jsName = "PhotoBackup"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getLibraryInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listAssets", returnType: CAPPluginReturnPromise)
    ]

    @objc func getLibraryInfo(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            guard status == .authorized || status == .limited else {
                call.resolve([
                    "authorized": false,
                    "status": "\(status.rawValue)"
                ])
                return
            }

            let options = PHFetchOptions()
            let photos = PHAsset.fetchAssets(with: .image, options: options)
            let videos = PHAsset.fetchAssets(with: .video, options: options)

            call.resolve([
                "authorized": true,
                "limited": status == .limited,
                "photos": photos.count,
                "videos": videos.count,
                "total": photos.count + videos.count
            ])
        }
    }

    @objc func listAssets(_ call: CAPPluginCall) {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)

        guard status == .authorized || status == .limited else {
            call.reject("Fotograf arsivi erisim izni gerekli")
            return
        }

        let options = PHFetchOptions()
        options.sortDescriptors = [
            NSSortDescriptor(key: "creationDate", ascending: true)
        ]

        let results = PHAsset.fetchAssets(with: options)
        var assets: [[String: Any]] = []

        results.enumerateObjects { asset, _, _ in
            assets.append([
                "id": asset.localIdentifier,
                "type": asset.mediaType == .video ? "video" : "photo",
                "createdAt": asset.creationDate?.timeIntervalSince1970 ?? 0,
                "width": asset.pixelWidth,
                "height": asset.pixelHeight
            ])
        }

        call.resolve([
            "assets": assets,
            "total": assets.count,
            "limited": status == .limited
        ])
    }
}
