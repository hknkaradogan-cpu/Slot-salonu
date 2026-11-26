import numpy as np, os
from PIL import Image
from scipy import ndimage
OUT='/home/claude/slot-salonu/client/assets'; os.makedirs(OUT,exist_ok=True)
S1='/mnt/user-data/uploads/c6c20273-image.png'; S2='/mnt/user-data/uploads/3a5cd3e1-image.png'
s1={'b_green':(15,10,182,172),'b_blue':(200,10,372,172),'b_hex':(405,10,567,172),'b_heart':(585,10,752,172),'b_moon':(780,10,947,172),'b_star':(965,10,1132,172),'b_sun':(1143,5,1327,180),'b_crown':(1338,10,1527,180),
 'b_wild':(8,165,272,355),'b_scatter':(283,160,548,355),'b_bonus':(588,175,828,350),'b_x2':(843,195,1003,352),'b_x4':(1017,195,1173,352),'b_x8':(1187,195,1343,352),'b_x10':(1358,195,1520,352),
 'b_fairy':(5,358,405,645),'fx_purple':(405,360,705,625),'fx_coins':(700,368,958,620),'fx_crystal':(958,368,1242,615),'fx_swirl':(1240,370,1532,615),
 'fx_rainbow':(3,630,348,790),'fx_circle':(352,615,668,800),'fx_confetti':(665,610,1012,795),'fx_pillar':(1005,595,1238,792),'fx_goldswirl':(1228,620,1532,800),
 'b_spin':(12,782,338,1010),'b_minus':(352,825,478,955),'b_plus':(487,825,607,955),'b_auto':(612,818,748,962),'b_win':(748,800,1092,985),'b_chest':(1092,795,1533,1015)}
s2={'a_princess':(0,0,362,402),'a_wild':(378,0,642,248),'a_scatter':(642,0,875,248),'a_bonus':(880,0,1145,248),
 'a_dia':(1152,18,1290,138),'a_heart':(1292,18,1422,138),'a_green':(1422,18,1532,138),'a_pgem':(1165,140,1258,238),'a_ystar':(1262,140,1350,238),'a_moon':(1355,140,1442,238),'a_bell':(1442,140,1532,238),
 'a_cherry':(365,245,470,350),'a_melon':(472,245,575,350),'a_grape':(590,245,705,350),'a_lemon':(715,245,832,350),'a_seven':(835,240,952,355),'a_bar':(950,250,1068,350),'a_ostar':(1070,245,1182,350),'a_pstar':(1185,245,1292,350),'a_cat':(1290,245,1532,472),
 'a_dia2':(342,352,452,458),'a_purple':(462,352,575,458),'a_green2':(580,352,685,458),'a_red':(685,352,778,458),'a_crown':(775,352,872,458),'a_wand':(868,345,975,462),'a_wings':(972,365,1082,452),'a_bow':(1080,352,1185,458),'a_bell2':(1185,352,1285,458),
 'a_x2':(5,428,202,532),'a_x3':(198,428,377,532),'a_x5':(372,428,550,532),'a_x10':(5,532,202,648),'a_x20':(198,532,377,648),'a_x100':(372,532,552,648),
 'a_jackpot':(565,455,1015,695),
 'ui_play':(1035,478,1162,600),'ui_refresh':(1165,478,1290,600),'ui_auto':(1292,478,1402,600),'ui_menu':(1400,478,1512,600),
 'ui_sound':(1060,600,1150,682),'ui_music':(1150,600,1238,682),'ui_info':(1238,600,1322,682),'ui_home':(1322,600,1408,682),'ui_close':(1405,600,1492,682),
 'fx_burstp':(0,648,212,858),'fx_orange':(205,648,415,858),'fx_blue':(410,648,622,858),'fx_violet':(618,660,812,850),'fx_vortex':(808,670,1012,850),
 'fx_pillarb':(1012,672,1105,850),'fx_pillarp':(1102,672,1198,850),'fx_flame':(1195,672,1292,855),'fx_star8':(1288,672,1420,840),
 'fx_cloud':(0,850,162,1024),'fx_cloudp':(160,850,312,1024),'fx_spark':(305,855,455,1024),'fx_starp':(450,855,565,975),'fx_shoot':(555,850,762,990),'fx_goldring':(740,850,895,1024),'fx_coins3':(890,850,1105,1024),'fx_gems':(1100,850,1335,1024),'a_chest':(1350,850,1536,1024)}
def key(img, fx=False):
    a=np.asarray(img.convert('RGB')).astype(np.float32); m=a.max(axis=2)
    if fx:  # efektler: parlaklık = opaklık, kenarlara doğru yumuşak sönüm
        al=np.clip((m-20)/200*1.3,0,1)
        h,w=m.shape; yy,xx=np.mgrid[0:h,0:w]; r=np.sqrt(((xx-w/2)/(w/2))**2+((yy-h/2)/(h/2))**2)
        al=al*np.clip((1.0-r)/0.35,0,1)
    else:
        dark=m<38
        lab,_=ndimage.label(dark)
        edge=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))-{0}
        bg=np.isin(lab,list(edge))
        bg=ndimage.binary_erosion(bg,iterations=1)
        al=np.where(bg,np.clip((m-8)/40,0,1),1.0)
        al=ndimage.gaussian_filter(al,0.7)
    rgb=np.where(al[...,None]>0.01,np.clip(a/np.maximum(al[...,None],0.35),0,255),0) if fx else a
    out=np.dstack([rgb,al*255]).astype(np.uint8)
    return Image.fromarray(out,'RGBA')
def run(src,boxes):
    im=Image.open(src).convert('RGB')
    for n,b in boxes.items():
        c=im.crop(b); fx=n.startswith('fx_')
        k=key(c,fx)
        mx=320 if fx or n in('a_princess','b_fairy','b_chest','b_win','b_spin','a_jackpot','a_cat') else 200
        if max(k.size)>mx: k.thumbnail((mx,mx),Image.LANCZOS)
        k.save(f'{OUT}/{n}.webp','WEBP',quality=88)
run(S1,s1); run(S2,s2)
# kahraman ve kart görselleri (kullanıcının gönderdiği)
def card(src,box,name,size=420):
    im=Image.open(src).convert('RGB'); 
    if box: im=im.crop(box)
    im.thumbnail((size,size),Image.LANCZOS); im.save(f'{OUT}/{name}.webp','WEBP',quality=86)
U='/mnt/user-data/uploads/'
card(U+'41dad543-image.jpg',None,'hero_zeus',600)
card(U+'e831216c-image.jpg',None,'hero_egypt',600)
card(U+'d5d88463-image.jpg',None,'card_777',480)
G=U+'03e1d66a-image.jpg'
card(G,(40,130,522,612),'card_egypt'); card(G,(558,130,1040,612),'card_vegas'); card(G,(40,743,522,1225),'card_zeus')
card(G,(558,743,1040,1225),'card_dragon'); card(G,(40,1357,522,1800),'card_pirate'); card(G,(558,1357,1040,1800),'card_gold')
print(len(os.listdir(OUT)))
