"""Emotion-first sticker selection; CLI compatibility and the DSH plugin share this file."""
from pathlib import Path
import argparse, json, random, datetime, re, os, uuid

HOME=Path(os.environ.get('DSH_HOME',Path.home()/'.dsh'))
ROOT=Path(os.environ.get('DSH_STICKER_LIBRARY',Path.cwd()/'表情包'))
USAGE=Path(os.environ.get('DSH_STICKER_USAGE',HOME/'feiyu-chat'/'sticker-usage.json'))
ALIASES={'收到':['赞同','确认'],'好':['赞同'],'喜欢你':['喜欢','比心'],'谢谢':['感谢'],'加油':['安慰','鼓励'],'笑':['开心','大笑'],'困':['困倦','晚安'],'再见':['招呼','告别'],'早安':['招呼','早安'],'晚安':['困倦','晚安'],'想你':['喜欢','害羞'],'麻了':['无语','委屈'],'震撼':['惊讶','大受震撼'],'社恐':['害羞','社交障碍'],'上班':['打工','摸鱼'],'穷':['贫穷','委屈']}

def cached_path(row):
    root=ROOT.resolve()
    path=(root/row['relativePath']).resolve()
    if not path.is_relative_to(root):raise ValueError('素材路径超出素材库')
    return path

def read_catalog():
    catalog=json.loads((ROOT/'CATALOG.json').read_text(encoding='utf-8-sig'))
    if not isinstance(catalog.get('items'),list):raise ValueError('CATALOG.json 缺少 items 数组')
    return catalog['items']

def markdown_for(row):
    cached=cached_path(row)
    if row.get('url'):
        if not re.match(r'^https?://[^\s<>]+$',row['url']):raise ValueError('素材 URL 必须是 HTTP(S) 地址')
        destination=row['url'].replace('(','%28').replace(')','%29')
    else:
        destination='<'+cached.as_posix()+'>'
    label=re.sub(r'[\[\]\r\n]','',row.get('label','表情'))
    return f'![{label}]({destination})'

def score_term(row,term):
    score=0
    for value in [term,*ALIASES.get(term,[])]:
        if value==row.get('category') or value==row.get('emotion'):score+=8
        if value==row.get('collection'):score+=8
        if value in row.get('label',''):score+=6
        if any(value in tag for tag in row.get('tags',[])):score+=4
        if value in row.get('use',''):score+=2
    return score

def find_rows(query,collection='',pick=False,include_contextual=False):
    catalog=read_catalog()
    recent=json.loads(USAGE.read_text(encoding='utf-8')) if USAGE.exists() else []
    recent_ids={x['id'] for x in recent[-8:]}
    terms=[x for x in re.split(r'\s+',query.strip()) if x]
    if not terms:terms=['开心']
    categories={r.get('category') for r in catalog}|{r.get('emotion') for r in catalog}|{r.get('label') for r in catalog if r.get('category')=='原有素材'}
    emotions={v for t in terms for v in [t,*ALIASES.get(t,[])] if v in categories}
    rows=[]
    for row in catalog:
        if not cached_path(row).is_file():continue
        if collection and row.get('collection','大肥鱼')!=collection:continue
        if pick and emotions and not emotions.intersection({row.get('category'),row.get('emotion'),row.get('label') if row.get('category')=='原有素材' else None}):continue
        scores=[score_term(row,term) for term in terms]
        if not all(scores):continue
        rows.append((0 if pick else sum(scores)-(10 if row['id'] in recent_ids else 0),row))
    random.shuffle(rows)
    if not pick:rows.sort(key=lambda x:x[0],reverse=True)
    return rows,recent

def stats():
    catalog=read_catalog()
    collections={}
    emotions={}
    available=0
    for row in catalog:
        if not cached_path(row).is_file():continue
        available+=1
        collection=row.get('collection','大肥鱼')
        collections[collection]=collections.get(collection,0)+1
        for emotion in {row.get('emotion'),row.get('label') if row.get('category')=='原有素材' else row.get('category')} - {None,''}:
            emotions[emotion]=emotions.get(emotion,0)+1
    return {'total':len(catalog),'available':available,'missing':len(catalog)-available,'collections':collections,'emotions':emotions}

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('query',nargs='?',default='开心')
    parser.add_argument('--limit',type=int,default=3)
    parser.add_argument('--pick',action='store_true',help='Choose one; remember selection, not delivery')
    parser.add_argument('--preview',action='store_true',help='Choose without recording selection')
    parser.add_argument('--current-id',default='')
    parser.add_argument('--step',type=int,choices=[-1,1],default=0,help='Preview only: previous/next in stable candidate order')
    parser.add_argument('--stats',action='store_true')
    parser.add_argument('--strict-emotion',action='store_true')
    parser.add_argument('--collection',default='')
    parser.add_argument('--include-contextual',action='store_true',help='Compatibility; all captions are included')
    args=parser.parse_args()
    if (args.step or args.current_id) and (not args.preview or not args.step or not args.current_id):
        parser.error('预览导航需要 --preview、--current-id 和 --step')
    if args.stats:
        print(json.dumps(stats(),ensure_ascii=False));return
    if args.strict_emotion:
        emotions=stats()['emotions']
        if not any(v in emotions for v in [args.query,*ALIASES.get(args.query,[])]):
            print(json.dumps({'matches':0,'query':args.query,'emotions':list(emotions)},ensure_ascii=False));return
    rows,recent=find_rows(args.query,args.collection,args.pick or args.preview,args.include_contextual)
    chosen=[x[1] for x in rows[:(1 if args.pick or args.preview else max(1,min(args.limit,10)))]]
    position=None
    if args.preview and rows:
        ordered=sorted((row for _,row in rows),key=lambda row:row['id'])
        if args.step:
            current=next((i for i,row in enumerate(ordered) if row['id']==args.current_id),-1 if args.step>0 else 0)
            chosen=[ordered[(current+args.step)%len(ordered)]]
        position=ordered.index(chosen[0])+1
    if args.pick and not args.preview and chosen:
        USAGE.parent.mkdir(parents=True,exist_ok=True)
        recent.append({'id':chosen[0]['id'],'selectedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()})
        temp=USAGE.with_name(USAGE.name+'.'+uuid.uuid4().hex+'.tmp')
        try:
            temp.write_text(json.dumps(recent[-30:],ensure_ascii=False,indent=2),encoding='utf-8')
            temp.replace(USAGE)
        finally:temp.unlink(missing_ok=True)
    for row in chosen:
        print(json.dumps({'id':row['id'],'label':row['label'],'category':row['category'],'collection':row.get('collection','大肥鱼'),'use':row.get('use',''),'autoEligible':row.get('autoEligible',True),'transport':'url' if row.get('url') else 'local','markdown':markdown_for(row),'cachedFile':str(cached_path(row)),'candidateCount':len(rows),**({'position':position} if args.preview else {})},ensure_ascii=False))
    if not chosen:print(json.dumps({'matches':0,'query':args.query},ensure_ascii=False))

if __name__=='__main__':main()
