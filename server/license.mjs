// Shared by the API, editor and static renderer; legacy content keeps its original license.
export const defaultLicense = Object.freeze({
 copyrightEnabled: true,
 licenseName: 'CC BY 4.0',
 licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
 licenseNote: '转载请注明出处。'
});

export const licensePresets = [
 {id:'by', ...defaultLicense},
 {id:'by-sa', licenseName:'CC BY-SA 4.0', licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/', licenseNote:'转载请注明出处，并以相同许可协议分享。'},
 {id:'by-nc', licenseName:'CC BY-NC 4.0', licenseUrl:'https://creativecommons.org/licenses/by-nc/4.0/', licenseNote:'转载请注明出处，仅限非商业用途。'},
 {id:'by-nc-sa', licenseName:'CC BY-NC-SA 4.0', licenseUrl:'https://creativecommons.org/licenses/by-nc-sa/4.0/', licenseNote:'转载请注明出处，仅限非商业用途，并以相同许可协议分享。'},
 {id:'reserved', licenseName:'保留所有权利', licenseUrl:'', licenseNote:'未经作者许可，请勿转载。'}
];
