import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { GelugRoutingModule } from './gelug-routing.module';
import { MainComponent } from './main/main.component';

import { ModalModule } from 'ngx-bootstrap/modal';
import { CKEditorModule } from '@ckeditor/ckeditor5-angular';

@NgModule({
  declarations: [MainComponent],
  imports: [
    CommonModule,
    GelugRoutingModule,
    ModalModule.forRoot(),
    FormsModule,
    CKEditorModule
  ]
})
export class GelugModule { }
