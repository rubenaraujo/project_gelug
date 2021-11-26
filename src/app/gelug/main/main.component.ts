import { Component, OnInit, ViewChild } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ModalDirective } from 'ngx-bootstrap/modal';
import { animate, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss'],
  animations: [
    trigger('fadeInOut', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate(600, style({ opacity: 1 }))
      ]),
      transition(':leave', [
        animate(600, style({ opacity: 0 }))
      ])
    ])
  ]
})
export class MainComponent implements OnInit {

  @ViewChild('editorModal', { static: false }) editorModal: ModalDirective;
  public soundList: Array<any>;

  constructor(private http: HttpClient) {
  }

  ngOnInit(): void {
    document.body.style.backgroundColor = '#121212';
    this.loadSounds();
  }

  // Audio related functions
  loadSounds(): void {
    this.getJSON('./assets/soundlist.json').toPromise().then((data) => {
      this.soundList = data;
    }).catch(error => {
      alert('Couldn\'t load sound list! (' + error.status + ' ' + error.statusText + ')');
    });
  }

  audioControls(sound: any): void {
    const soundElement = (document as any).getElementById(sound);
    const volumeElement = (document as any).getElementById(sound + '-volume');
    const soundObj = this.soundList.find(element => element.filename === sound) as any;

    if (soundElement.paused) {
      this.volumeControls(sound, volumeElement.value);
      soundObj.playing = true;
      soundElement.play();
    } else {
      soundObj.playing = false;
      soundElement.pause();
    }
  }

  volumeControls(sound: any, volume: any): void {
    (document as any).getElementById(sound).volume = Number(volume) / 100;
  }

  stopSounds(): void {
    this.soundList.forEach(element => {
      (document as any).getElementById(element.filename).pause();
      element.playing = false;
    });
  }

  getJSON(url: string): Observable<any> {
    return this.http.get(url);
  }
}
