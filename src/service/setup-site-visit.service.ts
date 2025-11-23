import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../app/environments/environment';

// DTOs
export interface SiteVisitDto {
  siteVisitId?: number;
  workflowId: number;
  productModelType: string;
  model?: string;
  otherPleaseSpecify?: string;
  
  // Product Model Section
  siteLayout?: string;
  structure?: string;
  passageHeight?: string;
  width?: string;
  projection?: string;
  heightAvailable?: string;
  wallType?: string;
  externalInsulation?: string;
  wallFinish?: string;
  wallThickness?: string;
  specialBrackets?: string;
  sideInfills?: string;
  flashingRequired?: string;
  flashingDimensions?: string;
  standOfBrackets?: string;
  standOfBracketDimension?: string;
  electrician?: string;
  electricalConnection?: string;
  location?: string;
  otherSiteSurveyNotes?: string;
  
  // Model Details Section
  fixtureType?: string;
  operation?: string;
  crankLength?: string;
  operationSide?: string;
  fabric?: string;
  ral?: string;
  valanceChoice?: string;
  valance?: string;
  windSensor?: string;
  
  // ShadePlus Section
  shadePlusRequired?: string;
  shadeType?: string;
  shadeplusFabric?: string;
  shadePlusAnyOtherDetail?: string;
  
  // Lights Section
  lights?: string;
  lightsType?: string;
  lightsAnyOtherDetails?: string;
  
  // Heater Section
  heater?: string;
  heaterManufacturer?: string;
  numberRequired?: string;
  heaterOutput?: string;
  heaterColour?: string;
  remoteControl?: string;
  controllerBox?: string;
  heaterAnyOtherDetails?: string;
  
  // Metadata
  dateCreated?: string;
  createdBy?: string;
  dateUpdated?: string;
  updatedBy?: string;
}

export interface CreateSiteVisitDto {
  workflowId: number;
  productModelType: string;
  model?: string;
  otherPleaseSpecify?: string;
  siteLayout?: string;
  structure?: string;
  passageHeight?: string;
  width?: string;
  projection?: string;
  heightAvailable?: string;
  wallType?: string;
  externalInsulation?: string;
  wallFinish?: string;
  wallThickness?: string;
  specialBrackets?: string;
  sideInfills?: string;
  flashingRequired?: string;
  flashingDimensions?: string;
  standOfBrackets?: string;
  standOfBracketDimension?: string;
  electrician?: string;
  electricalConnection?: string;
  location?: string;
  otherSiteSurveyNotes?: string;
  fixtureType?: string;
  operation?: string;
  crankLength?: string;
  operationSide?: string;
  fabric?: string;
  ral?: string;
  valanceChoice?: string;
  valance?: string;
  windSensor?: string;
  shadePlusRequired?: string;
  shadeType?: string;
  shadeplusFabric?: string;
  shadePlusAnyOtherDetail?: string;
  lights?: string;
  lightsType?: string;
  lightsAnyOtherDetails?: string;
  heater?: string;
  heaterManufacturer?: string;
  numberRequired?: string;
  heaterOutput?: string;
  heaterColour?: string;
  remoteControl?: string;
  controllerBox?: string;
  heaterAnyOtherDetails?: string;
}

export interface SiteVisitDto {
  siteVisitId?: number;
  workflowId: number;
  productModelType: string;
  model?: string;
  otherPleaseSpecify?: string;
  
  // Product Model Section
  siteLayout?: string;
  structure?: string;
  passageHeight?: string;
  width?: string;
  projection?: string;
  heightAvailable?: string;
  wallType?: string;
  externalInsulation?: string;
  wallFinish?: string;
  wallThickness?: string;
  specialBrackets?: string;
  sideInfills?: string;
  flashingRequired?: string;
  flashingDimensions?: string;
  standOfBrackets?: string;
  standOfBracketDimension?: string;
  electrician?: string;
  electricalConnection?: string;
  location?: string;
  otherSiteSurveyNotes?: string;
  
  // Model Details Section
  fixtureType?: string;
  operation?: string;
  crankLength?: string;
  operationSide?: string;
  fabric?: string;
  ral?: string;
  valanceChoice?: string;
  valance?: string;
  windSensor?: string;
  
  // ShadePlus Section
  shadePlusRequired?: string;
  shadeType?: string;
  shadeplusFabric?: string;
  shadePlusAnyOtherDetail?: string;
  
  // Lights Section
  lights?: string;
  lightsType?: string;
  lightsAnyOtherDetails?: string;
  
  // Heater Section
  heater?: string;
  heaterManufacturer?: string;
  numberRequired?: string;
  heaterOutput?: string;
  heaterColour?: string;
  remoteControl?: string;
  controllerBox?: string;
  heaterAnyOtherDetails?: string;
  
  // Metadata
  dateCreated?: string;
  createdBy?: string;
  dateUpdated?: string;
  updatedBy?: string;
}

export interface SiteVisitDropdownValues {
  [category: string]: string[];
}

@Injectable({
  providedIn: 'root'
})
export class SetupSiteVisitService {
  private apiUrl = `${environment.apiUrl}/api/SiteVisit`;

  constructor(private http: HttpClient) {}

  /**
   * Get all site visits for a workflow
   * GET /api/SiteVisit/workflow/{workflowId}
   */
  getSiteVisitsByWorkflowId(workflowId: number): Observable<SiteVisitDto[]> {
    return this.http.get<SiteVisitDto[]>(`${this.apiUrl}/workflow/${workflowId}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get site visit by ID
   * GET /api/SiteVisit/{id}
   */
  getSiteVisitById(id: number): Observable<SiteVisitDto> {
    return this.http.get<SiteVisitDto>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Create a new site visit
   * POST /api/SiteVisit
   */
  createSiteVisit(siteVisit: CreateSiteVisitDto): Observable<SiteVisitDto> {
    return this.http.post<SiteVisitDto>(this.apiUrl, siteVisit)
      .pipe(catchError(this.handleError));
  }

  /**
   * Update an existing site visit
   * PUT /api/SiteVisit/{id}
   */
  updateSiteVisit(id: number, siteVisit: SiteVisitDto): Observable<SiteVisitDto> {
    return this.http.put<SiteVisitDto>(`${this.apiUrl}/${id}`, siteVisit)
      .pipe(catchError(this.handleError));
  }

  /**
   * Delete a site visit
   * DELETE /api/SiteVisit/{id}
   */
  deleteSiteVisit(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`)
      .pipe(catchError(this.handleError));
  }

   /**
   * Get all dropdown values for site visits
   * GET /api/SiteVisitValues/all
   */
  getAllDropdownValues(): Observable<SiteVisitDropdownValues> {
    return this.http.get<SiteVisitDropdownValues>(`${this.apiUrl}/all`)
      .pipe(catchError(this.handleError));
  }

  /**
   * Get dropdown values for a specific category
   * GET /api/SiteVisitValues/category/{category}
   */
  getValuesByCategory(category: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/category/${category}`)
      .pipe(catchError(this.handleError));
  }


  /**
   * Handle HTTP errors
   */
  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'An error occurred';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Client Error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 0:
          errorMessage = 'Unable to connect to server. Please check if the API is running.';
          break;
        case 400:
          errorMessage = error.error?.message || 'Bad Request: Please check your input data';
          break;
        case 404:
          errorMessage = error.error?.message || 'Not Found: The requested resource was not found';
          break;
        case 500:
          errorMessage = error.error?.message || 'Internal Server Error: Please try again later';
          break;
        default:
          errorMessage = error.error?.message || `Error Code: ${error.status}`;
      }
    }

    console.error('HTTP Error:', errorMessage, error);
    return throwError(() => new Error(errorMessage));
  }
}