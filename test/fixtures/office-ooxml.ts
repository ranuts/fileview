// Synthetic OOXML fixture shapes adapted from ranuts/document test/e2e/lib/ooxml.ts.
import { createZip, readZipEntries, readZipEntry } from 'ranuts/utils';
import { deflateSync } from 'node:zlib';

/**
 * Archive plumbing comes from ranuts (`createZip` / `readZipEntries` /
 * `readZipEntry`): ecosystem first, and its reader takes sizes from the
 * central directory, which is what makes it survive streaming-written
 * archives. Only the OOXML-shaped helpers live here.
 */
export const makeStoredZip = (entries: ReadonlyArray<{ name: string; data: Uint8Array | string }>): Uint8Array =>
  createZip(entries);

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/**
 * A one-paragraph .docx (or, with `bodyXml`, an arbitrary <w:body> content).
 * `opts.headerText` / `opts.footerText` add a default header/footer part
 * wired through sectPr.
 */
export function buildDocx(
  text: string,
  bodyXml?: string,
  opts: { headerText?: string; footerText?: string } = {},
): Uint8Array {
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const hf = (tag: 'hdr' | 'ftr', t: string) =>
    XML_HEAD + `<w:${tag} xmlns:w="${W}"><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:${tag}>`;
  const extraOverrides =
    (opts.headerText
      ? '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>'
      : '') +
    (opts.footerText
      ? '<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'
      : '');
  const docRels =
    (opts.headerText ? `<Relationship Id="rIdH1" Type="${REL}/header" Target="header1.xml"/>` : '') +
    (opts.footerText ? `<Relationship Id="rIdF1" Type="${REL}/footer" Target="footer1.xml"/>` : '');
  const sectPr =
    opts.headerText || opts.footerText
      ? '<w:sectPr>' +
        (opts.headerText ? '<w:headerReference w:type="default" r:id="rIdH1"/>' : '') +
        (opts.footerText ? '<w:footerReference w:type="default" r:id="rIdF1"/>' : '') +
        '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
      : '';
  const extraParts: Array<{ name: string; data: string }> = [];
  if (opts.headerText) extraParts.push({ name: 'word/header1.xml', data: hf('hdr', opts.headerText) });
  if (opts.footerText) extraParts.push({ name: 'word/footer1.xml', data: hf('ftr', opts.footerText) });
  if (docRels) {
    extraParts.push({
      name: 'word/_rels/document.xml.rels',
      data:
        XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        docRels +
        '</Relationships>',
    });
  }
  return makeStoredZip([
    {
      name: '[Content_Types].xml',
      data:
        XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        extraOverrides +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      data:
        XML_HEAD +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'word/document.xml',
      data:
        XML_HEAD +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<w:body>${bodyXml ?? `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`}${sectPr}</w:body></w:document>`,
    },
    ...extraParts,
  ]);
}

/** A one-slide .pptx with a single title text box (minimal master/layout chain). */
export function buildPptx(title: string): Uint8Array {
  const NS =
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CT = 'application/vnd.openxmlformats-officedocument.presentationml';
  const shapeTree = (extra: string) =>
    '<p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    extra +
    '</p:spTree></p:cSld>';
  const theme =
    XML_HEAD +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements>' +
    '<a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1>' +
    '<a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink>' +
    '<a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements></a:theme>';
  const escaped = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const slide =
    XML_HEAD +
    `<p:sld ${NS}>` +
    shapeTree(
      '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>' +
        '<p:spPr><a:xfrm><a:off x="685800" y="457200"/><a:ext cx="7772400" cy="1143000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
        `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${escaped}</a:t></a:r></a:p></p:txBody></p:sp>`,
    ) +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  const layout =
    XML_HEAD +
    `<p:sldLayout ${NS} type="title" preserve="1">` +
    shapeTree('') +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  const master =
    XML_HEAD +
    `<p:sldMaster ${NS}>` +
    shapeTree('') +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '<p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="4400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles>' +
    '</p:sldMaster>';
  const presentation =
    XML_HEAD +
    `<p:presentation ${NS} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>' +
    '<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/>' +
    '</p:presentation>';
  const rels = (items: Array<[string, string, string]>) =>
    XML_HEAD +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('') +
    '</Relationships>';
  return makeStoredZip([
    {
      name: '[Content_Types].xml',
      data:
        XML_HEAD +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentation.main+xml"/>` +
        `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.slideMaster+xml"/>` +
        `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.slideLayout+xml"/>` +
        `<Override PartName="/ppt/slides/slide1.xml" ContentType="${CT}.slide+xml"/>` +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        '</Types>',
    },
    { name: '_rels/.rels', data: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]) },
    { name: 'ppt/presentation.xml', data: presentation },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      data: rels([
        ['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'],
        ['rId2', 'slide', 'slides/slide1.xml'],
      ]),
    },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: master },
    {
      name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels',
      data: rels([
        ['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'],
        ['rId2', 'theme', '../theme/theme1.xml'],
      ]),
    },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: layout },
    {
      name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
      data: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]),
    },
    { name: 'ppt/slides/slide1.xml', data: slide },
    {
      name: 'ppt/slides/_rels/slide1.xml.rels',
      data: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]),
    },
    { name: 'ppt/theme/theme1.xml', data: theme },
  ]);
}

export const LARGE_IMAGE_TEXT = ['Fileview LATIN before 中文导出测试你好世界', 'LATIN after image 中文尾段保留'];

function png4000(): Uint8Array {
  const width = 4000,
    height = 2000;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const offset = row + 1 + x * 3;
      raw[offset] = x < width / 2 ? 20 : 230;
      raw[offset + 1] = y < height / 2 ? 100 : 210;
      raw[offset + 2] = 180;
    }
  }
  const crc = (data: Uint8Array) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, bytes: Uint8Array) => {
    const type = Buffer.from(name);
    const out = Buffer.alloc(bytes.length + 12);
    out.writeUInt32BE(bytes.length, 0);
    type.copy(out, 4);
    Buffer.from(bytes).copy(out, 8);
    out.writeUInt32BE(crc(Buffer.concat([type, bytes])), bytes.length + 8);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export async function buildLargeImageDocx(): Promise<Uint8Array> {
  const image =
    '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="5486400" cy="2743200"/><wp:docPr id="1" name="4000 pixel test chart"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="chart.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="5486400" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  const paragraph = (text: string) => `<w:p><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;
  const source = buildDocx('', paragraph(LARGE_IMAGE_TEXT[0]) + image + paragraph(LARGE_IMAGE_TEXT[1]));
  const entries = await Promise.all(
    readZipEntries(source).map(async ({ name }) => {
      let data = (await readZipEntry(source, name))!;
      if (name === '[Content_Types].xml')
        data = new TextEncoder().encode(
          new TextDecoder()
            .decode(data)
            .replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'),
        );
      return { name, data };
    }),
  );
  entries.push({ name: 'word/media/chart.png', data: png4000() });
  entries.push({
    name: 'word/_rels/document.xml.rels',
    data: new TextEncoder().encode(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart.png"/></Relationships>',
    ),
  });
  return createZip(entries);
}
