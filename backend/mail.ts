import sanitizeHtml from 'sanitize-html';
import { accessToken } from './google.js';

const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
const idPattern = /^[a-f0-9]{8,32}$/i;
type Header = { name: string; value: string };
type Part = { mimeType?: string; filename?: string; body?: {data?: string;attachmentId?: string;size?: number}; parts?: Part[] };
type GmailMessage = { id: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: Part & {headers?:Header[]} };
type Attachment = { id: string; filename: string; mimeType: string; size: number };
export type MailSummary = {id:string;from:string;subject:string;date:string;snippet:string;unread:boolean};
const header = (hs: Header[] = [], key: string) => hs.find(h=>h.name.toLowerCase()===key.toLowerCase())?.value ?? '';
const summary = (m:GmailMessage):MailSummary => ({
  id:m.id,from:header(m.payload?.headers,'From'),subject:header(m.payload?.headers,'Subject')||'(Utan ämne)',
  date:m.internalDate?new Date(Number(m.internalDate)).toISOString():'',snippet:m.snippet??'',
  unread:(m.labelIds??[]).includes('UNREAD'),
});
async function get<T>(token:string,route:string):Promise<T>{
  const r=await fetch(base+route,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error('Gmail API failed ('+r.status+')');
  return await r.json() as T;
}
export async function inbox(pageToken?:string):Promise<{messages:MailSummary[];nextPageToken?:string}>{
  const token=await accessToken();
  const q=new URLSearchParams({maxResults:'50',labelIds:'INBOX'});
  if(pageToken) q.set('pageToken',pageToken);
  const page=await get<{messages?:{id:string}[];nextPageToken?:string}>(token,'/messages?'+q);
  const messages:MailSummary[]=[];
  for(let i=0;i<(page.messages??[]).length;i+=5){
    const batch=await Promise.all((page.messages??[]).slice(i,i+5).map(({id})=>get<GmailMessage>(token,
      '/messages/'+encodeURIComponent(id)+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject')));
    messages.push(...batch.map(summary));
  }
  return {messages,nextPageToken:page.nextPageToken};
}
function visit(part:Part|undefined,fn:(p:Part)=>void):void{
  if(!part)return;
  fn(part);
  for(const child of part.parts??[])visit(child,fn);
}
function bestPart(payload?:Part, mime='text/plain'):Part|undefined{
  let found:Part|undefined;
  visit(payload,p=>{if(!found && p.mimeType===mime && p.body?.data && !p.filename)found=p;});
  return found;
}
function safeHtml(raw:string):string{
  // No remote URLs, styles, forms, scripting, embedded resources, or active content.
  return sanitizeHtml(raw,{
    allowedTags:['p','br','div','span','strong','b','em','i','u','s','blockquote','pre','code',
      'ul','ol','li','table','thead','tbody','tr','td','th','h1','h2','h3','h4','hr','a'],
    allowedAttributes:{a:['href','title'],td:['colspan','rowspan'],th:['colspan','rowspan']},
    allowedSchemes:['https','mailto'],
    allowProtocolRelative:false,
    transformTags:{a:(_tag,attrs)=>({tagName:'a',attribs:{...attrs,rel:'noreferrer noopener',target:'_blank'}})},
    disallowedTagsMode:'discard',
  });
}
export async function readMessage(id:string):Promise<MailSummary & {to:string;body:string;html:string;attachments:Attachment[]}>{
  if(!idPattern.test(id))throw new Error('Invalid message id');
  const token=await accessToken();
  const message=await get<GmailMessage>(token,'/messages/'+id+'?format=full');
  const attachments:Attachment[]=[];
  visit(message.payload,p=>{
    if(p.filename && p.body?.attachmentId && p.body.size !== undefined)
      attachments.push({id:p.body.attachmentId,filename:p.filename,mimeType:p.mimeType??'application/octet-stream',size:p.body.size});
  });
  const plain=bestPart(message.payload);
  const html=bestPart(message.payload,'text/html');
  return {...summary(message),to:header(message.payload?.headers,'To'),
    body:(plain?.body?.data?Buffer.from(plain.body.data,'base64url').toString('utf8'):message.snippet??'').slice(0,200000),
    html:html?.body?.data?safeHtml(Buffer.from(html.body.data,'base64url').toString('utf8').slice(0,500000)):'',
    attachments};
}
export async function attachment(messageId:string,attachmentId:string):Promise<{data:Buffer;filename:string;mimeType:string}>{
  if(!idPattern.test(messageId)||!/^[a-zA-Z0-9_-]{5,1024}$/.test(attachmentId))throw new Error('Invalid attachment id');
  const token=await accessToken();
  const message=await get<GmailMessage>(token,'/messages/'+messageId+'?format=full');
  let part:Part|undefined;
  visit(message.payload,p=>{if(p.body?.attachmentId===attachmentId)part=p;});
  if(!part?.filename || !part.body?.size || part.body.size>15*1024*1024)throw new Error('Attachment not found or too large (15 MB max)');
  const payload=await get<{data?:string;size?:number}>(token,'/messages/'+messageId+'/attachments/'+encodeURIComponent(attachmentId));
  const data=Buffer.from(payload.data??'','base64url');
  if(data.length>15*1024*1024 || data.length!==part.body.size)throw new Error('Invalid attachment size');
  return {data,filename:part.filename,mimeType:part.mimeType??'application/octet-stream'};
}
